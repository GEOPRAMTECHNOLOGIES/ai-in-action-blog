import { SeeHow } from "@/components/SeeHow";

export default function Home() {
  return (
    <main className="landing">
      <section className="hero">
        <div className="hero-image-wrap">
          <img
            src="/blog-hero.png"
            alt="The Truth They Never Told You — AI awareness graphic"
            className="hero-image"
          />
        </div>

        <div className="hero-copy">
          <div className="brand">GEOPRAM TECHNOLOGIES</div>
          <h1 className="gradient-text">The world is moving fast. AI is accelerating it.</h1>
          <p className="hero-subline">One practical AI guide. One month of access.</p>
          <SeeHow />
        </div>
      </section>
    </main>
  );
}
