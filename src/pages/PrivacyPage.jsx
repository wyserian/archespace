/**
 * PrivacyPage.jsx - Public privacy policy (/privacy).
 */
import { LegalLayout } from './legal/LegalLayout'
import { TERMS_LAST_UPDATED } from '../lib/legal'

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy" updated={TERMS_LAST_UPDATED}>
      <p>
        ArcheSpace is built around <strong>zero-knowledge, end-to-end encryption</strong>. Your notes,
        spaces, and other content are encrypted on your device with a key derived from your vault PIN,
        which we never receive. This policy explains the limited data we do handle, and why.
      </p>

      <h2>Who we are</h2>
      <p>
        ArcheSpace ("we", "us") is the controller of the personal data described in this policy. You can
        reach us about any privacy matter at <a href="mailto:support@archespace.app">support@archespace.app</a>.
      </p>

      <h2>What we cannot see</h2>
      <p>
        The content you store - space names, items, notes, secrets, tags - is encrypted in your browser
        or app before it is sent to our servers. Our backend only ever stores <strong>ciphertext</strong>.
        We, our hosting providers, and our operators cannot read your content.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account email</strong> - to sign you in, send security and account emails, and recover access to your login (not your vault).</li>
        <li><strong>Encrypted content</strong> - stored only as ciphertext, as described above.</li>
        <li><strong>Minimal metadata</strong> - timestamps, ordering, and non-content fields needed to sync and display your data. This includes any self-destruct time you set, so the server can delete that space or item on time even when none of your devices is open.</li>
        <li><strong>Security logs</strong> - a limited audit log of authentication events (e.g. sign-in, password change) to protect your account.</li>
        <li><strong>Technical data</strong> - standard request information (such as IP address) processed transiently by our hosting/CDN for security and delivery.</li>
      </ul>
      <p>We do <strong>not</strong> use advertising, cross-site tracking, or third-party analytics profiles.</p>

      <h2>Legal bases for processing</h2>
      <p>Where the EU/UK General Data Protection Regulation (GDPR) applies, we process your personal data on these bases:</p>
      <ul>
        <li><strong>Performance of a contract</strong> - to create your account and provide the Service you sign up for.</li>
        <li><strong>Legitimate interests</strong> - to keep the Service secure, prevent abuse, and maintain and improve it, balanced against your rights.</li>
        <li><strong>Legal obligation</strong> - where we must process data to comply with the law.</li>
        <li><strong>Consent</strong> - where we ask for it (for example, optional emails); you can withdraw it at any time.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        We use your device's local storage for essentials only: your session tokens, your appearance
        preferences (theme and accent), and an encrypted vault session so you don't have to re-enter your
        PIN on every reload. We do not use advertising or analytics cookies or cross-site trackers. Because
        this storage is strictly necessary to provide the Service, no cookie-consent banner is required.
      </p>

      <h2>Service providers</h2>
      <p>We share the limited data above only with providers that help us run the service:</p>
      <ul>
        <li><strong>Supabase</strong> - database, authentication, and storage of encrypted content.</li>
        <li><strong>Cloudflare</strong> - hosting and content delivery.</li>
        <li><strong>Resend</strong> - delivery of transactional emails (e.g. confirmation, password reset).</li>
      </ul>
      <p>These providers process data on our behalf under data processing agreements and never receive your decrypted content.</p>

      <h2>App updates (Android)</h2>
      <p>
        The Android app can check <strong>GitHub</strong>, where its source code and releases are
        published, for a newer version. It does this at most once a day after you unlock, and when you
        tap <strong>Check for updates</strong> in Settings. Updates you choose to install are downloaded
        from GitHub too. Each check or download is a plain request to GitHub: it sends no account details
        or content, but GitHub receives standard request information such as your IP address, under
        GitHub's own privacy statement. You can turn the daily check off in <strong>Settings &gt;
        About &gt; Check automatically</strong>.
      </p>

      <h2>International data transfers</h2>
      <p>
        Our providers may store and process data on infrastructure located outside your country, including
        outside the EU/EEA and India. Where personal data is transferred internationally, we rely on
        appropriate safeguards - such as the European Commission's Standard Contractual Clauses or an
        adequacy decision - to protect it.
      </p>

      <h2>Data retention and deletion</h2>
      <p>
        Your data is kept while your account is active. You can permanently delete your account and all
        associated data at any time from <strong>Settings &gt; Account</strong>. Because your content is
        encrypted, deleting it removes any way to recover it.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live (including under the GDPR, India's Digital Personal Data Protection
        Act, and similar laws), you have rights over your personal data:
      </p>
      <ul>
        <li><strong>Access</strong> a copy of the personal data we hold about you.</li>
        <li><strong>Rectify</strong> inaccurate data - you can edit your account details in the app.</li>
        <li><strong>Erase</strong> your data - delete your account and everything associated with it from <strong>Settings &gt; Account</strong>.</li>
        <li><strong>Export</strong> your content - your spaces and items can be exported to PDF in the app; because your content is end-to-end encrypted, only you can produce a readable copy.</li>
        <li><strong>Restrict or object</strong> to certain processing.</li>
        <li><strong>Withdraw consent</strong> where processing is based on consent.</li>
        <li><strong>Complain</strong> to your data protection authority - such as an EU/EEA supervisory authority or the Data Protection Board of India.</li>
      </ul>
      <p>
        To exercise any of these, contact us at <a href="mailto:support@archespace.app">support@archespace.app</a>.
        We respond within the timeframes required by applicable law.
      </p>

      <h2>Security</h2>
      <p>
        We use end-to-end encryption, encrypted transport (HTTPS), rate limiting, optional two-factor
        authentication and passkeys, and a separate vault PIN for your content. No system is perfectly
        secure, but our zero-knowledge design means a breach of our servers exposes only ciphertext.
      </p>

      <h2>Your responsibility for keys</h2>
      <p>
        Your <strong>vault PIN</strong> and <strong>recovery code</strong> are never sent to us and cannot
        be reset by us. If you lose both, your encrypted content cannot be recovered - only reset (deleted)
        so you can start fresh. Please store your recovery code somewhere safe.
      </p>

      <h2>Automated decisions</h2>
      <p>
        We do not use your personal data for automated decision-making or profiling that produces legal or
        similarly significant effects.
      </p>

      <h2>Children</h2>
      <p>
        ArcheSpace is not directed to children under 13 (or the minimum age in your jurisdiction), and we
        do not knowingly collect their data.
      </p>

      <h2>Changes</h2>
      <p>We may update this policy from time to time. Material changes are reflected by the "last updated" date above.</p>

      <h2>Grievance Officer</h2>
      <p>
        For users in India, in accordance with the Digital Personal Data Protection Act and applicable IT
        rules, you may contact our Grievance Officer:
      </p>
      <p>
        <strong>ArcheSpace Support</strong>
        <br />
        <a href="mailto:support@archespace.app">support@archespace.app</a>
      </p>

      <h2>Contact</h2>
      <p>Questions about privacy? Contact us at <a href="mailto:support@archespace.app">support@archespace.app</a>.</p>
    </LegalLayout>
  )
}
