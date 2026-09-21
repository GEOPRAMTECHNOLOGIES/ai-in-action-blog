"use client";

import { useEffect, useState } from "react";

type Step = "terms" | "form" | "payment" | "success";

export function SeeHow() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("terms");
  const [terms, setTerms] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [amountKes, setAmountKes] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.amountKes) setAmountKes(data.amountKes); })
      .catch(() => undefined);
  }, []);

  const reset = () => {
    setStep("terms"); setTerms(false); setEmail(""); setPhone("");
    setPaymentId(""); setMessage(""); setError(""); setAccessCode(""); setExpiresAt(null);
  };

  const start = () => { reset(); setOpen(true); };
  const close = () => { if (step !== "payment") setOpen(false); };

  const submit = async () => {
    setError("");
    if (!terms) return setError("Please agree to the access terms before continuing.");
    setStep("payment");
    try {
      const response = await fetch("/api/pay", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, termsAccepted: terms })
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Unable to start payment."); setStep("form"); return; }
      setPaymentId(data.paymentId);
      if (data.amountKes) setAmountKes(data.amountKes);
      setMessage(data.message || "Check your phone for the M-Pesa prompt.");
      poll(data.paymentId);
    } catch {
      setError("Network error. Please try again."); setStep("form");
    }
  };

  const poll = (id: string) => {
    let count = 0;
    const timer = window.setInterval(async () => {
      count += 1;
      try {
        const response = await fetch(`/api/payment-status?id=${encodeURIComponent(id)}`, { cache: "no-store" });
        const data = await response.json();
        if (data.status === "SUCCESS") {
          window.clearInterval(timer); setAccessCode(data.accessCode || ""); setExpiresAt(data.expiresAt || null); setStep("success"); return;
        }
        if (data.status === "FAILED") {
          window.clearInterval(timer); setError(data.resultDesc || "The payment was not completed."); setStep("form"); return;
        }
      } catch { /* keep polling */ }
      if (count >= 60) {
        window.clearInterval(timer);
        setMessage("We are still waiting for Safaricom confirmation. Your access will be emailed automatically if payment completes.");
      }
    }, 3000);
  };

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
  const validPhone = /^(?:\+?254|0)(?:7|1)\d{8}$/.test(phone.replace(/[\s-]/g, ""));
  const canPay = validEmail && validPhone && terms;

  return (
    <>
      <button className="see-button" onClick={start}>SEE HOW <span>→</span></button>

      {open && (
        <div className="checkout-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && close()}>
          <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <div className="modal-topbar">
              <div className="modal-brand"><span className="brand-dot">✦</span><span>GEOPRAM AI</span></div>
              {step !== "payment" && <button className="close-button" aria-label="Close" onClick={close}>×</button>}
            </div>

            {step === "terms" && <div className="modal-body">
              <div className="modal-badge">AI EXPERIENCE</div>
              <h2 id="checkout-title">See how AI can change your workflow.</h2>
              <p className="modal-subtitle">Get private access to the GeoPram Technologies AI guide and practical ideas you can start using immediately.</p>
              <div className="feature-list">
                <div><b>01</b><span><strong>Pay with M-Pesa</strong><small>Secure Safaricom STK Push checkout.</small></span></div>
                <div><b>02</b><span><strong>Get your access code</strong><small>Sent to the email you provide.</small></span></div>
                <div><b>03</b><span><strong>30-day access</strong><small>Your access expires after the configured period.</small></span></div>
              </div>
              <label className="terms-check"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} /><span>I agree to the access terms and understand that this is a paid digital service.</span></label>
              {error && <div className="error-box">{error}</div>}
              <button className="primary-action" disabled={!terms} onClick={() => setStep("form")}>Continue <span>→</span></button>
              <div className="modal-footnote">Powered by <b>GeoPram Technologies</b></div>
            </div>}

            {step === "form" && <div className="modal-body">
              <div className="step-line"><span>STEP 1</span><i></i><span>PAYMENT</span></div>
              <h2 id="checkout-title">Where should we send your access?</h2>
              <p className="modal-subtitle">Use an email you check regularly and the Kenyan M-Pesa number that should receive the STK prompt.</p>

              <label className={`input-card ${email && !validEmail ? "invalid" : ""}`}>
                <span className="input-badge">@</span><span className="input-copy"><b>Email address</b><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com"/><small>Receipt + access code will be sent here.</small></span>
              </label>
              {email && !validEmail && <div className="field-error">Enter a valid email address.</div>}

              <label className={`input-card ${phone && !validPhone ? "invalid" : ""}`}>
                <span className="input-badge phone-badge">+254</span><span className="input-copy"><b>M-Pesa phone number</b><input inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0712 345 678"/><small>Safaricom will send the payment prompt to this number.</small></span>
              </label>
              {phone && !validPhone && <div className="field-error">Use a valid Kenyan mobile number, e.g. 0712 345 678.</div>}

              <div className="order-summary"><span><b>AI guide access</b><small>Personal access · 30 days</small></span><strong>{amountKes ? `KES ${amountKes.toLocaleString()}` : "KES —"}</strong></div>
              {error && <div className="error-box">{error}</div>}
              <button className="primary-action" disabled={!canPay} onClick={submit}>Continue to M-Pesa <span>→</span></button>
              <div className="security-line"><span>🔒</span> Secure checkout · Safaricom M-Pesa</div>
            </div>}

            {step === "payment" && <div className="modal-body payment-state">
              <div className="mpesa-orb"><span>⌁</span></div><div className="modal-badge">WAITING FOR PAYMENT</div><h2>Check your phone</h2>
              <p className="modal-subtitle">{message || "An M-Pesa STK prompt has been sent. Enter your M-Pesa PIN to complete the payment."}</p>
              <div className="loading-line"><i></i><i></i><i></i></div><small className="muted">Waiting for secure confirmation…</small>
            </div>}

            {step === "success" && <div className="modal-body success-state">
              <div className="success-mark">✓</div><div className="modal-badge">PAYMENT CONFIRMED</div><h2>Your access is ready.</h2><p className="modal-subtitle">Your receipt and access code have been sent to <b>{email}</b>.</p><div className="access-code">{accessCode}</div>{expiresAt && <small className="muted">Access expires {new Date(expiresAt).toLocaleDateString()}</small>}<a className="primary-action link-action" href={`/access/${encodeURIComponent(accessCode)}`}>Open the AI guide <span>→</span></a></div>}
          </section>
        </div>
      )}
    </>
  );
}
