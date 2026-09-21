import os, re, secrets, base64
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, render_template
import requests
from pymongo import MongoClient

app = Flask(__name__)

APP_URL = os.getenv('APP_URL', 'https://ai-in-action-blog.vercel.app').rstrip('/')
MONGO_URI = os.getenv('MONGODB_URI', '')
DB_NAME = os.getenv('DATABASE_NAME', 'geopram_ai')
PAYMENT_AMOUNT_KES = int(float(os.getenv('PAYMENT_AMOUNT_KES', '100')))
ACCESS_DAYS = int(os.getenv('ACCESS_DAYS', '30'))

_db = None

def db():
    global _db
    if _db is None:
        if not MONGO_URI:
            raise RuntimeError('MONGODB_URI is not configured in Vercel.')
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        _db = client[DB_NAME]
        _db.payments.create_index('id', unique=True)
        _db.payments.create_index('checkoutRequestId', unique=True, sparse=True)
        _db.access.create_index('code', unique=True)
    return _db

def env(name, default=''):
    return os.getenv(name, default).strip()

def normalize_phone(phone):
    raw = re.sub(r'[^0-9+]', '', str(phone or '').strip())
    if raw.startswith('+'):
        raw = raw[1:]
    if raw.startswith('0') and len(raw) == 10:
        raw = '254' + raw[1:]
    elif raw.startswith(('7','1')) and len(raw) == 9:
        raw = '254' + raw
    if not re.fullmatch(r'254[17]\d{8}', raw):
        raise ValueError('Use a valid Kenyan mobile number such as 0712345678.')
    return raw

def daraja_token():
    base = 'https://api.safaricom.co.ke' if env('DARAJA_ENV','production').lower() == 'production' else 'https://sandbox.safaricom.co.ke'
    key = env('DARAJA_CONSUMER_KEY')
    secret = env('DARAJA_CONSUMER_SECRET')
    if not key or not secret:
        raise RuntimeError('DARAJA_CONSUMER_KEY or DARAJA_CONSUMER_SECRET is missing.')
    auth = base64.b64encode(f'{key}:{secret}'.encode()).decode()
    r = requests.get(base + '/oauth/v1/generate?grant_type=client_credentials', headers={'Authorization':'Basic '+auth}, timeout=20)
    try: data = r.json()
    except Exception: data = {}
    if not r.ok or not data.get('access_token'):
        raise RuntimeError('Daraja OAuth failed: ' + str(data.get('errorMessage') or data.get('error_description') or r.status_code))
    return base, data['access_token']

def callback_url():
    raw = env('DARAJA_CALLBACK_URL') or (APP_URL + '/api/payments/callback')
    if not raw.startswith('https://'):
        raise RuntimeError('DARAJA_CALLBACK_URL must be an HTTPS URL.')
    if raw.rstrip('/').endswith('/api/payments/callback'):
        return raw.rstrip('/')
    return raw.rstrip('/') + '/api/payments/callback'

def daraja_stk(phone, amount, reference, description):
    customer = normalize_phone(phone)
    transaction_type = env('DARAJA_TRANSACTION_TYPE', 'CustomerBuyGoodsOnline')
    shortcode = env('DARAJA_SHORTCODE')
    till = env('DARAJA_TILL_NUMBER')
    passkey = env('DARAJA_PASSKEY')
    if not shortcode or not passkey:
        raise RuntimeError('DARAJA_SHORTCODE and DARAJA_PASSKEY are required.')
    if transaction_type == 'CustomerBuyGoodsOnline' and not till:
        raise RuntimeError('DARAJA_TILL_NUMBER is required for CustomerBuyGoodsOnline.')
    base, token = daraja_token()
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    password = base64.b64encode(f'{shortcode}{passkey}{timestamp}'.encode()).decode()
    body = {
        'BusinessShortCode': shortcode,
        'Password': password,
        'Timestamp': timestamp,
        'TransactionType': transaction_type,
        'Amount': int(amount),
        'PartyA': customer,
        'PartyB': till or shortcode,
        'PhoneNumber': customer,
        'CallBackURL': callback_url(),
        'AccountReference': str(reference)[:12],
        'TransactionDesc': str(description)[:13]
    }
    r = requests.post(base + '/mpesa/stkpush/v1/processrequest', headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}, json=body, timeout=30)
    try: data = r.json()
    except Exception: data = {}
    if not r.ok or data.get('ResponseCode') != '0':
        msg = data.get('ResponseDescription') or data.get('errorMessage') or data.get('error_description') or r.status_code
        raise RuntimeError('Daraja STK failed: ' + str(msg))
    return data

@app.get('/')
def home():
    return render_template('index.html', amount=PAYMENT_AMOUNT_KES)

@app.get('/api/config')
def config():
    return jsonify(amountKes=PAYMENT_AMOUNT_KES)

@app.post('/api/pay')
def pay():
    try:
        body = request.get_json(silent=True) or {}
        email = str(body.get('email','')).strip().lower()
        phone = normalize_phone(body.get('phone',''))
        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]{2,}', email):
            return jsonify(error='Enter a valid email address.'), 422
        if not body.get('termsAccepted'):
            return jsonify(error='Please accept the access terms.'), 422
        payment_id = 'GPAI-' + secrets.token_hex(5).upper()
        d = db()
        d.payments.insert_one({'id':payment_id,'email':email,'phone':phone,'amount':PAYMENT_AMOUNT_KES,'status':'PENDING','createdAt':datetime.now(timezone.utc)})
        try:
            result = daraja_stk(phone, PAYMENT_AMOUNT_KES, payment_id, 'GeoPram AI Access')
        except Exception as e:
            d.payments.update_one({'id':payment_id},{'$set':{'status':'FAILED','error':str(e),'updatedAt':datetime.now(timezone.utc)}})
            return jsonify(error=str(e), paymentId=payment_id), 500
        d.payments.update_one({'id':payment_id},{'$set':{'merchantRequestId':result.get('MerchantRequestID'),'checkoutRequestId':result.get('CheckoutRequestID'),'responseDescription':result.get('ResponseDescription'),'updatedAt':datetime.now(timezone.utc)}})
        return jsonify(ok=True,paymentId=payment_id,message=result.get('CustomerMessage') or 'Check your phone for the M-Pesa prompt.',amountKes=PAYMENT_AMOUNT_KES)
    except ValueError as e:
        return jsonify(error=str(e)), 422
    except Exception as e:
        app.logger.exception('PAY ERROR')
        return jsonify(error=str(e)), 500

@app.get('/api/payment-status')
def status():
    payment_id = request.args.get('id','').strip()
    if not payment_id:
        return jsonify(error='Payment id is required.'), 400
    try:
        p = db().payments.find_one({'id':payment_id},{'_id':0})
    except Exception as e:
        return jsonify(error=str(e)), 500
    if not p:
        return jsonify(error='Payment not found.'), 404
    result = {'status':p.get('status','PENDING'),'resultCode':p.get('resultCode'),'resultDesc':p.get('resultDescription')}
    if p.get('status') == 'SUCCESS':
        a = db().access.find_one({'paymentId':payment_id},{'_id':0})
        if a:
            result.update(accessCode=a['code'], expiresAt=a['expiresAt'].isoformat())
    return jsonify(result)

@app.get('/api/payments/callback')
def callback_probe():
    return jsonify(ok=True, service='geopram-ai-mpesa-callback', status='READY')

@app.post('/api/payments/callback')
def callback():
    try:
        body = request.get_json(silent=True) or {}
        cb = body.get('Body',{}).get('stkCallback')
        if not cb:
            return jsonify(ResultCode=0, ResultDesc='Accepted')
        checkout = cb.get('CheckoutRequestID')
        p = db().payments.find_one({'checkoutRequestId':checkout})
        if not p:
            return jsonify(ResultCode=0, ResultDesc='Accepted')
        code = int(cb.get('ResultCode', 1))
        desc = str(cb.get('ResultDesc') or '')
        if code == 0:
            expires = datetime.now(timezone.utc) + timedelta(days=ACCESS_DAYS)
            access_code = 'GPAI-' + secrets.token_urlsafe(8).upper().replace('_','-')
            db().payments.update_one({'_id':p['_id']},{'$set':{'status':'SUCCESS','resultCode':code,'resultDescription':desc,'updatedAt':datetime.now(timezone.utc)}})
            db().access.insert_one({'code':access_code,'paymentId':p['id'],'email':p['email'],'expiresAt':expires,'createdAt':datetime.now(timezone.utc)})
        else:
            db().payments.update_one({'_id':p['_id']},{'$set':{'status':'FAILED','resultCode':code,'resultDescription':desc,'updatedAt':datetime.now(timezone.utc)}})
        return jsonify(ResultCode=0, ResultDesc='Accepted')
    except Exception:
        app.logger.exception('CALLBACK ERROR')
        return jsonify(ResultCode=0, ResultDesc='Accepted')

@app.get('/api/health')
def health():
    return jsonify(ok=True, app='geopram-ai', callback=callback_url())

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.getenv('PORT','5000')))
