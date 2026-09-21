import { notFound } from "next/navigation";
import { payments } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AccessPage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code || "").toUpperCase();
  if (!/^[A-F0-9]{16}$/.test(code)) notFound();

  const collection = await payments();
  const payment = await collection.findOne({ accessCode: code, status: "SUCCESS" });

  if (!payment || !payment.expiresAt || payment.expiresAt.getTime() <= Date.now()) {
    return (
      <main className="expired-page">
        <div className="expired-card">
          <div className="brand">GeoPram Technologies</div>
          <h1>Access expired</h1>
          <p>This AI learning access code is no longer active.</p>
          <a href="/">Return to the homepage</a>
        </div>
      </main>
    );
  }

  return (
    <main className="content-page">
      <article className="article-card">
        <div className="brand">GeoPram Technologies</div>
        <div className="eyebrow">AI • DIGITAL SKILLS • PRODUCTIVITY</div>
        <h1>The World Is Miles Away From Those Who Aren’t Using AI</h1>
        <p className="lead gradient-text">The world is moving fast. AI is accelerating it.</p>

        <div className="rainbow-rule" />

        <p><b>AI is no longer just a futuristic idea. It is becoming a practical advantage.</b></p>

        <p>
          Every day, people are using AI to research faster, learn new skills, analyze information,
          automate repetitive work, create content, solve problems, and make better-informed decisions.
        </p>

        <p>Meanwhile, many people are still watching from the sidelines.</p>

        <p>The difference is not simply about who has access to AI.</p>

        <p><b>It is about who has learned how to use it.</b></p>

        <h2>Think about two people given the same task.</h2>

        <p>
          One spends hours searching, organizing information, writing, calculating, designing,
          and correcting mistakes manually.
        </p>

        <p>
          The other uses AI as a tool to accelerate research, generate ideas, analyze information,
          automate repetitive tasks, and improve their final work.
        </p>

        <p>They may have the same talent. They may even have the same resources.</p>

        <p>
          But their <b>speed, productivity, and ability to experiment</b> can be dramatically different.
        </p>

        <h2>AI won’t replace every person.</h2>

        <p>
          But people who know how to work effectively with AI may have an advantage over those
          who completely ignore it.
        </p>

        <p>The goal isn’t to let AI think for you.</p>

        <p className="gradient-text big">The goal is to think better with AI.</p>

        <div className="action-grid">
          <div>Ask better questions.</div>
          <div>Learn faster.</div>
          <div>Automate repetitive work.</div>
          <div>Analyze more information.</div>
          <div>Create more efficiently.</div>
          <div>Test ideas faster.</div>
          <div>Build things you couldn’t build before.</div>
        </div>

        <p>
          AI is becoming another layer of human capability.
        </p>

        <p>
          And the people who start learning it today won’t have to wait for the future to arrive.
        </p>

        <p className="quote">
          They will be building it.
        </p>

        <div className="closing">
          <p><b>The question is no longer: “Will AI change the world?”</b></p>
          <p className="gradient-text"><b>What will you do with it?</b></p>
        </div>

        <div className="access-meta">
          Access expires: {payment.expiresAt.toISOString().slice(0, 10)}
        </div>
        <footer>Powered by GeoPram Technologies</footer>
      </article>
    </main>
  );
}
