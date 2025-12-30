import Link from "next/link";

export default function Home() {
  return (
    <main className="bg-white text-slate-900">

      {/* HEADER */}
      <header className="bg-slate-950 border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src="/logo.jpeg" alt="Accucert" className="h-8 w-auto" />

          <nav className="hidden md:flex gap-8 text-sm font-medium text-slate-300">
            <a href="#services" className="hover:text-lime-400">Services</a>
            <a href="#how-it-works" className="hover:text-lime-400">How It Works</a>
            <a href="#contact" className="hover:text-lime-400">Contact</a>
          </nav>

          <Link
            href="/upload"
            className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-md text-sm"
          >
            Get Started
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="bg-slate-950 text-white">
        <div className="max-w-7xl mx-auto px-6 py-28 grid md:grid-cols-2 gap-16 items-center">

          {/* LEFT */}
          <div>
            <span className="inline-block bg-slate-800 text-lime-400 text-xs font-medium px-3 py-1 rounded-full mb-6">
              Trusted by 10,000+ Clients Worldwide
            </span>

            <h1 className="text-5xl font-bold leading-tight mb-6">
              Official Document{" "}
              <span className="text-green-600">Translation</span>
              <br />
              You Can Trust
            </h1>

            <p className="text-slate-300 mb-8 max-w-xl">
              Certified translations for visas, court submissions, birth
              certificates, and official documents. Accurate, secure, and
              legally recognised.
            </p>

            <div className="flex gap-4 mb-6">
              <Link
                href="/upload"
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-md"
              >
                Upload Document
              </Link>
              <Link
                href="/pricing"
                className="border border-slate-600 text-slate-200 px-6 py-3 rounded-md hover:bg-slate-800"
              >
                View Pricing
              </Link>
            </div>

            <div className="flex items-center gap-2 text-sm text-slate-400">
              ⭐⭐⭐⭐⭐ <span>4.9/5 from 2,300+ reviews</span>
            </div>
          </div>

          {/* RIGHT */}
          <div className="bg-white rounded-2xl shadow-xl p-6 text-slate-900">
            <div className="bg-slate-100 rounded-xl p-16 flex flex-col items-center justify-center text-center">
              <svg
                className="w-16 h-16 text-green-600 mb-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path d="M7 2h8l4 4v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
              </svg>
              <p className="font-semibold">
                Professional Certified Translations
              </p>
            </div>

            <div className="grid grid-cols-3 text-center mt-6 text-sm">
              <div>
                <div className="text-xl font-semibold text-green-600">50+</div>
                <div className="text-slate-500">Languages</div>
              </div>
              <div>
                <div className="text-xl font-semibold text-orange-500">24h</div>
                <div className="text-slate-500">Turnaround</div>
              </div>
              <div>
                <div className="text-xl font-semibold text-green-600">100%</div>
                <div className="text-slate-500">Certified</div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* DOCUMENT TYPES */}
      <section id="services" className="bg-slate-50 py-24">
        <div className="max-w-7xl mx-auto px-6 text-center">

          <div className="w-16 h-1 bg-orange-500 mx-auto mb-6 rounded-full" />

          <h2 className="text-4xl font-bold mb-4">
            Documents We <span className="text-green-600">Translate</span>
          </h2>

          <p className="text-gray-600 max-w-2xl mx-auto mb-16">
            Specialising in official and legal documents accepted worldwide.
          </p>

          <div className="grid md:grid-cols-3 gap-8 text-left">
            {[
              ["Visa Documents", "Certified translations for immigration and visa applications."],
              ["Birth Certificates", "Official translations for legal use."],
              ["Court Submissions", "Translations suitable for court proceedings."],
              ["Academic Records", "Diplomas and transcripts with certification."],
              ["Marriage Certificates", "Certified family documentation."],
              ["Business Documents", "Contracts and corporate paperwork."],
            ].map(([title, desc]) => (
              <div
                key={title}
                className="bg-white rounded-xl p-6 border border-slate-200 hover:border-green-600 transition"
              >
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 text-center">

          <h2 className="text-4xl font-bold mb-4">
            How It <span className="text-green-600">Works</span>
          </h2>

          <p className="text-gray-600 mb-16">
            Three simple steps to your certified translation
          </p>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              ["01", "Upload Document", "Upload your document securely."],
              ["02", "Expert Review", "Our team reviews and certifies it."],
              ["03", "Download & Use", "Receive your certified translation."],
            ].map(([num, title, desc]) => (
              <div key={num}>
                <div className="text-6xl font-bold text-slate-200 mb-4">{num}</div>
                <h3 className="font-semibold mb-2">{title}</h3>
                <p className="text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-green-600 via-lime-500 to-orange-500 py-24">
        <div className="max-w-3xl mx-auto px-6 text-center text-white">
          <h2 className="text-4xl font-bold mb-4">
            Ready to Get Started?
          </h2>
          <p className="mb-8 text-white/90">
            Upload your document now and receive a quote within minutes.
          </p>

          <Link
            href="/upload"
            className="inline-block bg-slate-950 hover:bg-slate-900 text-white px-8 py-3 rounded-md font-medium"
          >
            Upload Your Document
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-slate-950 text-slate-400 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-12 grid md:grid-cols-4 gap-8 text-sm">
          <div>
            <img src="/logo.jpeg" className="h-7 mb-3" />
            <p>
              Certified translations for official documents worldwide.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-2">Services</h4>
            <ul className="space-y-1">
              <li>Visa Documents</li>
              <li>Birth Certificates</li>
              <li>Court Submissions</li>
              <li>Academic Records</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-2">Company</h4>
            <ul className="space-y-1">
              <li>About</li>
              <li>Pricing</li>
              <li>Contact</li>
              <li>FAQ</li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-white mb-2">Legal</h4>
            <ul className="space-y-1">
              <li>Privacy Policy</li>
              <li>Terms of Service</li>
              <li>Certification</li>
            </ul>
          </div>
        </div>

        <div className="text-center text-xs text-slate-500 pb-6">
          © 2024 Accucert. All rights reserved.
        </div>
      </footer>

    </main>
  );
}
