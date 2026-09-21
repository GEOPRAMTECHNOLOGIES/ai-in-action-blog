import os, re, secrets, base64, logging, smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from flask import Flask, request, jsonify, render_template
import requests
from pymongo import MongoClient

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

APP_URL = os.getenv('APP_URL', 'https://ai-in-action-blog.vercel.app').rstrip('/')
DB_NAME = os.getenv('DATABASE_NAME', 'geopram_ai')
PAYMENT_AMOUNT_KES = int(float(os.getenv('PAYMENT_AMOUNT_KES', '100')))
ACCESS_DAYS = int(os.getenv('ACCESS_DAYS', '30'))
MONGO_URI = os.getenv('MONGODB_URI', '').strip()
_db = None


def env(name, default=''):
    return os.getenv(name, default).strip()


def now():
    return datetime.now(timezone.utc)


def json_error(message, status=400, code='ERROR', details=None):
    body = {'ok': False, 'error': message, 'code': code}
    if details:
        body['details'] = details
    return jsonify(body), status


def db():
    global _db
    if _db is None:
        if not MONGO_URI:
            raise RuntimeError('MONGODB_URI is not configured in Vercel.')
        client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=8000)
        database = client[DB_NAME]
        database.command('ping')
        payments = database.payments

        # The older GeoPram build used a unique id_1 index. Existing documents
        # without id then caused E11000 {id:null}. This app uses paymentId and
        # removes that obsolete index if it is present.
        try:
            for name, info in payments.index_information().items():
                key = info.get('key') or []
                if key == [('id', 1)]:
                    payments.drop_index(name)
        except Exception:
            logging.exception('Could not inspect/drop obsolete payment id index')

        payments.create_index([('paymentId', 1)], unique=True, sparse=True)
        payments.create_index([('checkoutRequestId', 1)], unique=True, sparse=True)
        payments.create_index([('status', 1), ('createdAt', -1)])
        database.access.create_index([('code', 1)], unique=True)
        _db = database
    return _db


def normalize_mpesa_phone(phone):
    # Same normalization pattern used by the working GLDC system.
    raw = re.sub(r'[^0-9+]', '', str(phone or '').strip())
    if raw.startswith('+'):
        raw = raw[1:]
    if raw.startswith('0') and len(raw) == 10:
        raw = '254' + raw[1:]
    elif (raw.startswith('7') or raw.startswith('1')) and len(raw) == 9:
        raw = '254' + raw
    if not re.fullmatch(r'254[17]\d{8}', raw):
        raise RuntimeError('INVALID_MPESA_PHONE: Use a Kenyan mobile number such as 0712345678 or +254712345678.')
    return raw


def daraja_callback_url():
    raw = env('DARAJA_CALLBACK_URL') or (APP_URL + '/api/payments/callback')
    if not raw.startswith('https://'):
        raise RuntimeError('DARAJA_CALLBACK_INVALID: DARAJA_CALLBACK_URL must be an HTTPS URL.')
    raw = raw.rstrip('/')
    if not raw.endswith('/api/payments/callback'):
        raw += '/api/payments/callback'
    return raw


def daraja_token():
    base = 'https://api.safaricom.co.ke' if env('DARAJA_ENV', 'production').lower() == 'production' else 'https://sandbox.safaricom.co.ke'
    key = env('DARAJA_CONSUMER_KEY')
    secret = env('DARAJA_CONSUMER_SECRET')
    if not key or not secret:
        raise RuntimeError('DARAJA_CONFIG_MISSING: Configure DARAJA_CONSUMER_KEY and DARAJA_CONSUMER_SECRET.')
    auth = base64.b64encode(f'{key}:{secret}'.encode()).decode()
    r = requests.get(
        base + '/oauth/v1/generate?grant_type=client_credentials',
        headers={'Authorization': 'Basic ' + auth},
        timeout=20,
    )
    try:
        data = r.json()
    except Exception:
        data = {}
    if not r.ok or not data.get('access_token'):
        msg = data.get('errorMessage') or data.get('error_description') or data.get('errorCode') or f'HTTP {r.status_code}'
        raise RuntimeError('DARAJA_TOKEN_FAILED: ' + str(msg))
    return base, data['access_token']


def daraja_stk(phone, amount, reference, description):
    customer = normalize_mpesa_phone(phone)
    amount = int(round(float(amount)))
    if amount < 1:
        raise RuntimeError('INVALID_PAYMENT_AMOUNT: Payment amount must be at least KES 1.')

    # This follows the working GLDC implementation:
    # Buy Goods => BusinessShortCode = shortcode, PartyB = till.
    transaction_type = env('DARAJA_TRANSACTION_TYPE', 'CustomerBuyGoodsOnline')
    shortcode = env('DARAJA_SHORTCODE')
    till = env('DARAJA_TILL_NUMBER')
    passkey = env('DARAJA_PASSKEY')

    if not shortcode or not passkey:
        raise RuntimeError('DARAJA_CONFIG_MISSING: Configure DARAJA_SHORTCODE and DARAJA_PASSKEY.')
    if transaction_type == 'CustomerBuyGoodsOnline' and not till:
        raise RuntimeError('DARAJA_CONFIG_MISSING: Configure DARAJA_TILL_NUMBER for CustomerBuyGoodsOnline.')

    base, token = daraja_token()
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    password = base64.b64encode(f'{shortcode}{passkey}{timestamp}'.encode()).decode()
    callback = daraja_callback_url()

    body = {
        'BusinessShortCode': shortcode,
        'Password': password,
        'Timestamp': timestamp,
        'TransactionType': transaction_type,
        'Amount': amount,
        'PartyA': customer,
        'PartyB': till if transaction_type == 'CustomerBuyGoodsOnline' else shortcode,
        'PhoneNumber': customer,
        'CallBackURL': callback,
        'AccountReference': str(reference)[:12],
        'TransactionDesc': str(description)[:13],
    }

    r = requests.post(
        base + '/mpesa/stkpush/v1/processrequest',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'},
        json=body,
        timeout=30,
    )
    try:
        data = r.json()
    except Exception:
        data = {}

    if not r.ok or data.get('ResponseCode') != '0':
        msg = data.get('ResponseDescription') or data.get('errorMessage') or data.get('error_description') or data.get('errorCode') or f'HTTP {r.status_code}'
        raise RuntimeError('DARAJA_STK_FAILED: ' + str(msg))
    return data


def send_access_email(email, code, expires_at):
    host = env('SMTP_HOST')
    user = env('SMTP_USERNAME') or env('SMTP_USER')
    password = env('SMTP_PASSWORD') or env('GMAIL_APP_PASSWORD')
    sender = env('SMTP_FROM') or env('EMAIL_FROM_ADDRESS') or user
    if not host or not user or not password or not sender:
        return False
    msg = EmailMessage()
    msg['Subject'] = 'GeoPram AI — Your access code'
    msg['From'] = sender
    msg['To'] = email
    msg.set_content(
        f'Your GeoPram AI payment was received.\n\n'
        f'Access code: {code}\n'
        f'Valid until: {expires_at.isoformat()}\n\n'
        f'Keep this code private.\n\nGeoPram Technologies'
    )
    port = int(env('SMTP_PORT', '587'))
    with smtplib.SMTP(host, port, timeout=20) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
    return True


def create_access(payment):
    database = db()
    existing = database.access.find_one({'paymentId': payment['paymentId']})
    if existing:
        return existing
    expires_at = now() + timedelta(days=ACCESS_DAYS)
    for _ in range(5):
        code = secrets.token_urlsafe(9).replace('-', '').replace('_', '').upper()[:12]
        doc = {
            'code': code,
            'paymentId': payment['paymentId'],
            'email': payment.get('email'),
            'phone': payment.get('phone'),
            'createdAt': now(),
            'expiresAt': expires_at,
            'status': 'ACTIVE',
        }
        try:
            database.access.insert_one(doc)
            try:
                send_access_email(payment.get('email', ''), code, expires_at)
            except Exception:
                logging.exception('Access email failed')
            return doc
        except Exception as exc:
            if 'duplicate' not in str(exc).lower():
                raise
    raise RuntimeError('Could not create access code.')


@app.get('/')
def home():
    return render_template('index.html', amount=PAYMENT_AMOUNT_KES)


@app.get('/api/config')
def config():
    return jsonify(ok=True, amountKes=PAYMENT_AMOUNT_KES, accessDays=ACCESS_DAYS)


@app.post('/api/pay')
def pay():
    try:
        body = request.get_json(silent=True) or {}
        email = str(body.get('email', '')).strip().lower()
        phone = str(body.get('phone', '')).strip()
        terms = bool(body.get('termsAccepted'))

        if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]{2,}', email):
            return json_error('Enter a valid email address.', 422, 'EMAIL_INVALID')
        normalized_phone = normalize_mpesa_phone(phone)
        if not terms:
            return json_error('Please agree to the access terms.', 422, 'TERMS_REQUIRED')

        payment_id = 'GP-' + secrets.token_hex(5).upper()
        reference = payment_id
        payment = {
            'paymentId': payment_id,
            'email': email,
            'phone': normalized_phone,
            'amount': PAYMENT_AMOUNT_KES,
            'currency': 'KES',
            'reference': reference,
            'description': 'GeoPram AI access',
            'status': 'PENDING',
            'createdAt': now(),
            'updatedAt': now(),
        }
        database = db()
        database.payments.insert_one(payment)

        try:
            result = daraja_stk(normalized_phone, PAYMENT_AMOUNT_KES, reference, 'GeoPram AI')
        except Exception as exc:
            database.payments.update_one(
                {'paymentId': payment_id},
                {'$set': {'status': 'FAILED', 'error': str(exc), 'updatedAt': now()}},
            )
            logging.exception('STK request failed payment=%s', payment_id)
            return json_error(str(exc), 502, 'DARAJA_STK_FAILED')

        database.payments.update_one(
            {'paymentId': payment_id},
            {'$set': {
                'merchantRequestId': result.get('MerchantRequestID'),
                'checkoutRequestId': result.get('CheckoutRequestID'),
                'responseDescription': result.get('ResponseDescription'),
                'customerMessage': result.get('CustomerMessage'),
                'updatedAt': now(),
            }},
        )
        return jsonify(
            ok=True,
            paymentId=payment_id,
            status='PENDING',
            message=result.get('CustomerMessage') or 'Check your phone and approve the M-Pesa prompt.',
        )
    except Exception as exc:
        logging.exception('Payment creation failed')
        return json_error(str(exc), 500, 'PAYMENT_CREATE_FAILED')


@app.get('/api/payment-status')
def payment_status():
    payment_id = str(request.args.get('id', '')).strip()
    if not payment_id:
        return json_error('Payment ID is required.', 422, 'PAYMENT_ID_REQUIRED')
    try:
        p = db().payments.find_one({'paymentId': payment_id}, {'_id': 0})
        if not p:
            return json_error('Payment not found.', 404, 'PAYMENT_NOT_FOUND')
        status = str(p.get('status', 'PENDING')).upper()
        result = {
            'ok': True,
            'status': 'SUCCESS' if status == 'SUCCESSFUL' else ('FAILED' if status in {'FAILED', 'CANCELLED'} else 'PENDING'),
            'resultCode': p.get('resultCode'),
            'resultDesc': p.get('resultDescription') or p.get('error'),
        }
        if status == 'SUCCESSFUL':
            access = db().access.find_one({'paymentId': payment_id}, {'_id': 0})
            if access:
                result.update({'accessCode': access.get('code'), 'expiresAt': access.get('expiresAt').isoformat() if access.get('expiresAt') else None})
        return jsonify(result)
    except Exception as exc:
        logging.exception('Payment status failed')
        return json_error(str(exc), 500, 'PAYMENT_STATUS_FAILED')


@app.get('/api/payments/callback')
def callback_probe():
    return jsonify(ok=True, service='geopram-mpesa-callback', status='READY'), 200


@app.post('/api/payments/callback')
def callback():
    try:
        body = request.get_json(silent=True) or {}
        cb = body.get('Body', {}).get('stkCallback')
        if not cb:
            return jsonify(ResultCode=0, ResultDesc='Accepted')

        checkout = cb.get('CheckoutRequestID')
        payment = db().payments.find_one({'checkoutRequestId': checkout, 'status': 'PENDING'})
        if not payment:
            return jsonify(ResultCode=0, ResultDesc='Accepted')

        result_code = cb.get('ResultCode')
        try:
            result_code_int = int(result_code)
        except Exception:
            result_code_int = 1
        result_desc = str(cb.get('ResultDesc') or '').strip()
        success = result_code_int == 0
        cancelled = (not success) and (result_code_int == 1032 or 'cancel' in result_desc.lower())
        final_status = 'SUCCESSFUL' if success else ('CANCELLED' if cancelled else 'FAILED')

        metadata = cb.get('CallbackMetadata', {}).get('Item', []) or []
        values = {item.get('Name'): item.get('Value') for item in metadata}
        update = {
            'status': final_status,
            'resultCode': result_code,
            'resultDescription': result_desc,
            'updatedAt': now(),
        }
        if success:
            update.update({
                'mpesaReceiptNumber': values.get('MpesaReceiptNumber'),
                'transactionDate': values.get('TransactionDate'),
                'phoneNumber': values.get('PhoneNumber'),
                'paidAmount': values.get('Amount'),
            })

        database = db()
        database.payments.update_one({'_id': payment['_id']}, {'$set': update})

        if success:
            merged = dict(payment)
            merged.update(update)
            access = create_access(merged)
            database.payments.update_one(
                {'_id': payment['_id']},
                {'$set': {'accessCode': access['code'], 'expiresAt': access['expiresAt'], 'updatedAt': now()}},
            )

        logging.info('Daraja callback payment=%s code=%s desc=%s', payment.get('paymentId'), result_code, result_desc)
        return jsonify(ResultCode=0, ResultDesc='Accepted')
    except Exception:
        logging.exception('Daraja callback processing failed')
        # Always acknowledge the Daraja callback to avoid repeated delivery.
        return jsonify(ResultCode=0, ResultDesc='Accepted'), 200


@app.get('/access/<code>')
def access(code):
    p = db().access.find_one({'code': code.upper()}, {'_id': 0})
    if not p:
        return render_template('access.html', valid=False), 404
    expires = p.get('expiresAt')
    valid = bool(expires and expires > now() and p.get('status') == 'ACTIVE')
    return render_template('access.html', valid=valid, code=p.get('code'), expires_at=expires.isoformat() if expires else '')


@app.get('/api/health')
def health():
    try:
        db().command('ping')
        return jsonify(ok=True, database=True)
    except Exception as exc:
        return json_error(str(exc), 500, 'HEALTH_FAILED')


@app.errorhandler(Exception)
def unhandled(exc):
    logging.exception('Unhandled application error')
    if request.path.startswith('/api/'):
        return json_error('An internal server error occurred.', 500, 'INTERNAL_ERROR')
    return 'Internal server error', 500
