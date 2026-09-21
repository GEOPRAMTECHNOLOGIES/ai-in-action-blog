"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  Spinner
} from "@fluentui/react-components";

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

  const reset = () => {
    setStep("terms");
    setTerms(false);
    setEmail("");
    setPhone("");
    setPaymentId("");
    setMessage("");
    setError("");
    setAccessCode("");
    setExpiresAt(null);
  };

  const start = () => {
    reset();
    setOpen(true);
  };

  const submit = async () => {
    setError("");
    if (!terms) {
      setError("Please agree to the terms before continuing.");
      return;
    }

    setStep("payment");
    try {
      const response = await fetch("/api/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, phone, termsAccepted: terms })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to start payment.");
        setStep("form");
        return;
      }

      setPaymentId(data.paymentId);
      setMessage(data.message || "Check your phone for the M-Pesa prompt.");
      poll(data.paymentId);
    } catch {
      setError("Network error. Please try again.");
      setStep("form");
    }
  };

  const poll = (id: string) => {
    let count = 0;
    const timer = window.setInterval(async () => {
      count += 1;
      try {
        const response = await fetch(`/api/payment-status?id=${encodeURIComponent(id)}`, {
          cache: "no-store"
        });
        const data = await response.json();

        if (data.status === "SUCCESS") {
          window.clearInterval(timer);
          setAccessCode(data.accessCode || "");
          setExpiresAt(data.expiresAt || null);
          setStep("success");
          return;
        }

        if (data.status === "FAILED") {
          window.clearInterval(timer);
          setError(data.resultDesc || "The payment was not completed.");
          setStep("form");
          return;
        }
      } catch {
        // Continue polling.
      }

      if (count >= 40) {
        window.clearInterval(timer);
        setError("We are still waiting for M-Pesa confirmation. Check your email shortly.");
        setStep("form");
      }
    }, 3000);
  };

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
  const validPhone = /^(?:\+?254|0)(?:7|1)\d{8}$/.test(phone.replace(/[\s-]/g, ""));
  const canPay = validEmail && validPhone && terms;

  return (
    <>
      <Button appearance="primary" size="large" className="see-button" onClick={start}>
        SEE HOW
      </Button>

      <Dialog open={open} onOpenChange={(_, data) => setOpen(data.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {step === "terms" && "Before you continue"}
              {step === "form" && "Unlock the AI guide"}
              {step === "payment" && "Complete M-Pesa payment"}
              {step === "success" && "Access unlocked"}
            </DialogTitle>

            <DialogContent>
              {step === "terms" && (
                <div className="modal-content terms-panel">
                  <div className="modal-intro">
                    <div className="modal-icon">✦</div>
                    <div>
                      <div className="modal-kicker">GEOPRAM AI</div>
                      <h3>See how AI can change your workflow.</h3>
                    </div>
                  </div>
                  <p className="modal-lead">You are purchasing personal access to the GeoPram Technologies AI guide.</p>
                  <div className="info-cards">
                    <div><span>01</span><b>Secure M-Pesa</b><small>Payment via Safaricom STK Push.</small></div>
                    <div><span>02</span><b>30-day access</b><small>Your access period is shown at checkout.</small></div>
                    <div><span>03</span><b>Email receipt</b><small>Your receipt and access code are emailed to you.</small></div>
                  </div>
                  <label className="terms-row">
                    <Checkbox
                      checked={terms}
                      onChange={(_, data) => setTerms(Boolean(data.checked))}
                    />
                    <span>I agree to the terms and access conditions.</span>
                  </label>
                  <Button appearance="primary" className="modal-primary" disabled={!terms} onClick={() => setStep("form")}>
                    Continue to checkout <span>→</span>
                  </Button>
                </div>
              )}

              {step === "form" && (
                <div className="modal-content checkout-panel">
                  <div className="checkout-heading">
                    <div className="modal-kicker">STEP 1 OF 2</div>
                    <h3>Where should we send your access?</h3>
                    <p>Enter the email you check regularly and the M-Pesa number that will receive the payment prompt.</p>
                  </div>

                  <div className="field-card">
                    <div className="field-symbol">@</div>
                    <div className="field-main">
                      <Field label="Email address" validationMessage={email && !validEmail ? "Please enter a valid email address." : undefined}>
                        <Input
                          type="email"
                          value={email}
                          onChange={(_, data) => setEmail(data.value)}
                          placeholder="name@example.com"
                          contentBefore={<span className="input-icon">✉</span>}
                        />
                      </Field>
                      <div className="field-help">Your receipt and 30-day access code will be sent here.</div>
                    </div>
                  </div>

                  <div className="field-card">
                    <div className="field-symbol">+254</div>
                    <div className="field-main">
                      <Field label="M-Pesa phone number" validationMessage={phone && !validPhone ? "Use a Kenyan number, e.g. 0712 345 678." : undefined}>
                        <Input
                          value={phone}
                          onChange={(_, data) => setPhone(data.value)}
                          placeholder="0712 345 678"
                          contentBefore={<span className="input-icon">☎</span>}
                        />
                      </Field>
                      <div className="field-help">Keep this phone nearby. Safaricom will show the STK PIN prompt.</div>
                    </div>
                  </div>

                  <div className="checkout-summary">
                    <div><span>AI guide access</span><small>Personal • 30 days</small></div>
                    <strong>KES {process.env.NEXT_PUBLIC_PAYMENT_AMOUNT_KES || "—"}</strong>
                  </div>

                  {error && <div className="error-box">{error}</div>}

                  <Button appearance="primary" className="modal-primary" disabled={!canPay} onClick={submit}>
                    Continue to M-Pesa <span>→</span>
                  </Button>
                  <div className="secure-note">🔒 Secure checkout · Safaricom M-Pesa</div>
                </div>
              )}

              {step === "payment" && (
                <div className="modal-content center payment-panel">
                  <Spinner size="large" />
                  <h3>Check your phone</h3>
                  <p>{message || "M-Pesa STK Push sent. Enter your PIN to complete payment."}</p>
                  <p className="small">Waiting for secure payment confirmation…</p>
                </div>
              )}

              {step === "success" && (
                <div className="modal-content center">
                  <div className="success-mark">✓</div>
                  <h3>Payment confirmed</h3>
                  <p>Your access code is:</p>
                  <div className="access-code">{accessCode}</div>
                  <p className="small">
                    A receipt and access code have been sent to <b>{email}</b>.
                  </p>
                  {expiresAt && (
                    <p className="small">Expires: {new Date(expiresAt).toLocaleDateString()}</p>
                  )}
                  <a className="open-content" href={`/access/${encodeURIComponent(accessCode)}`}>
                    Open the AI guide
                  </a>
                </div>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  );
}
