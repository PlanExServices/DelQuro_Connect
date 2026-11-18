import { useState } from "react";
import { Link } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { Btn } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { DeleteModal } from "@/pages/Profile";

const supportEmail = "info@delqurolabs.com";

function PolicyPage({ title, children }) {
  return (
    <main className="min-h-screen px-4 py-8" style={{ background: "var(--surface)" }}>
      <div className="max-w-2xl mx-auto rounded-3xl bg-white p-6 sm:p-9 card-shadow">
        <Logo size={40} />
        <h1 className="font-display text-3xl mt-6 mb-5" style={{ color: "var(--brand)" }}>{title}</h1>
        <div className="space-y-4 text-base leading-relaxed" style={{ color: "var(--on-surface)" }}>{children}</div>
        <nav aria-label="Support and policies" className="flex flex-wrap gap-4 pt-5 mt-6 border-t text-sm font-semibold"
          style={{ color: "var(--teal-dark)" }}>
          <Link to="/login">Sign in</Link>
          <Link to="/privacy">Privacy policy</Link>
          <Link to="/account-deletion">Account deletion</Link>
          <Link to="/support">Support</Link>
          <Link to="/community-guidelines">Community guidelines</Link>
        </nav>
      </div>
    </main>
  );
}

export function Privacy() {
  return (
    <PolicyPage title="Privacy policy">
      <p>DelQuro Labs operates DelQuro Connect, an invitation-based workspace for veterinary hospital teams.</p>
      <h2 className="text-lg font-semibold">Data used to run your workspace</h2>
      <p>Connect stores your name, work email, role, campus, preferences and any optional profile information you provide. It stores password hashes and session records to manage access, along with failed sign-in records to protect accounts.</p>
      <p>Connect stores the posts, messages, attachments, schedule files, protocol acknowledgments, time-off requests and reports you submit. The service uses this information to display work activity, coordinate staffing and review abuse. Authorized teammates and workspace administrators can access information according to the feature and their role. Administrators can review reported content and take action.</p>
      <p>The mobile app stores a sign-in credential in the operating system’s secure storage. It temporarily stores files you open on the device. If you share or save a file using your device’s share menu, that copy is controlled by the destination you choose.</p>
      <p>Connect relies on service providers to host and operate the workspace. The mobile app does not use advertising or request location access.</p>
      <h2 className="text-lg font-semibold">Retention and deletion</h2>
      <p>You can delete your account in Settings or on the <Link className="underline" to="/account-deletion">account deletion page</Link>. Connect removes your profile and associated records from the active service. Shared operational records such as posted schedules can remain available to your team with the link to your account removed. Ask your administrator about personal information included inside shared files. Backup copies are subject to the workspace’s backup retention schedule.</p>
      <p>For privacy questions, write to <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PolicyPage>
  );
}

export function AccountDeletion() {
  const { user, loading, logout } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);

  return (
    <PolicyPage title="Delete your DelQuro Connect account">
      {deleted ? <p role="status">Your account was deleted.</p> : <>
        <p>You can permanently delete your account on this page or in the DelQuro Connect app under Settings → Delete account.</p>
        <p>Deletion removes your profile, sign-in credentials, messages, posts, comments and time-off requests from the active service. Shared operational records such as posted schedules may remain available with the link to your account removed. See the <Link className="underline" to="/privacy">privacy policy</Link> for retention details.</p>
        <p>If you are the last active workspace administrator, transfer the administrator role before deleting your account. Contact <Link className="underline" to="/support">support</Link> if you need help closing the workspace or regaining access.</p>
        {!loading && (user ? (
          <Btn variant="danger" onClick={() => setConfirming(true)}>Delete account</Btn>
        ) : <Link className="font-semibold underline" to="/login?continue=delete-account">Sign in to delete your account</Link>)}
      </>}
      {confirming && <DeleteModal onClose={() => setConfirming(false)} onDone={() => {
        setConfirming(false);
        setDeleted(true);
        logout();
      }} />}
    </PolicyPage>
  );
}

export function Support() {
  return (
    <PolicyPage title="DelQuro Connect support">
      <p>Contact your workspace administrator for an invitation, help accessing your account, or questions about your team’s settings and content.</p>
      <p>For help with the app, account deletion, or a safety concern, email DelQuro Labs at <a className="underline" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
      <p>Describe the problem and include your workspace name and device type. Keep passwords, invitation codes and client records out of the email.</p>
    </PolicyPage>
  );
}

export function CommunityGuidelines() {
  return (
    <PolicyPage title="Community guidelines">
      <p>Use DelQuro Connect for your veterinary team’s work. Respect your teammates and share information only with the appropriate people.</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Harassment, discrimination, threats, sexual exploitation, illegal content and spam are prohibited.</li>
        <li>Keep client and patient records in your practice’s designated system. Get permission before sharing another person’s private information.</li>
        <li>Use Report or block on a message, post or comment to report content or a teammate. Blocking hides that teammate’s content from your view.</li>
      </ul>
      <p>Your workspace administrator reviews reports and can remove content or suspend accounts. You can also contact <Link className="underline" to="/support">DelQuro Labs support</Link> about a safety concern.</p>
    </PolicyPage>
  );
}
