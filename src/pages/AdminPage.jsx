import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowSquareOut,
  CaretDown,
  Check,
  EnvelopeSimple,
  FileImage,
  FloppyDisk,
  LockKey,
  MagnifyingGlass,
  NotePencil,
  SignOut,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  getAdminSession,
  getAttachmentUrl,
  getBooking,
  isDemoMode,
  listBookings,
  loginAdmin,
  logoutAdmin,
  sendBookingEmail,
  statusOptions,
  updateBooking,
} from "../bookingService.js";
import "./AdminPage.css";

const FALLBACK_STATUSES = [
  { value: "new", label: "New" },
  { value: "needs_reply", label: "Needs reply" },
  { value: "in_review", label: "In review" },
  { value: "awaiting_deposit", label: "Awaiting deposit" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "declined", label: "Declined" },
];

function demoModeEnabled() {
  try {
    return Boolean(typeof isDemoMode === "function" ? isDemoMode() : isDemoMode);
  } catch {
    return false;
  }
}

function normalizeStatuses(options) {
  const normalized = Array.isArray(options)
    ? options.map((option) => {
        if (typeof option === "string") return { value: option, label: humanize(option) };
        return {
          value: option.value ?? option.id ?? option.status,
          label: option.label ?? option.name ?? humanize(option.value ?? option.id ?? option.status),
        };
      }).filter((option) => option.value && option.value !== "all")
    : [];
  return normalized.length ? normalized : FALLBACK_STATUSES;
}

function normalizeBookingList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.bookings)) return result.bookings;
  if (Array.isArray(result?.data?.bookings)) return result.data.bookings;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

function normalizeBooking(result) {
  return result?.booking ?? result?.data?.booking ?? result?.data ?? result ?? null;
}

function bookingId(booking) {
  return booking?.id ?? booking?.bookingId ?? booking?.reference ?? booking?.referenceId ?? "";
}

function humanize(value) {
  if (!value) return "—";
  return String(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function slugify(value) {
  return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function readPath(source, path) {
  return path.split(".").reduce((value, key) => value?.[key], source);
}

function firstValue(source, paths, fallback = "") {
  for (const path of paths) {
    const value = readPath(source, path);
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function displayValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  return value || "—";
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const source = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? `${value}T12:00:00` : value;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

function statusLabel(value, options) {
  return options.find((option) => option.value === value)?.label ?? humanize(value);
}

function StatusBadge({ value, options }) {
  return (
    <span className="admin-status" data-status={slugify(value)}>
      <span aria-hidden="true" />
      {statusLabel(value, options)}
    </span>
  );
}

function FieldPair({ label, value, href }) {
  return (
    <div className="admin-field-pair">
      <dt>{label}</dt>
      <dd>{href && value ? <a href={href}>{displayValue(value)}</a> : displayValue(value)}</dd>
    </div>
  );
}

function AttachmentLink({ booking, attachment }) {
  const [state, setState] = useState({ loading: true, href: "", error: "" });
  const id = bookingId(booking);
  const attachmentId = attachment?.id ?? attachment?.key ?? attachment?.name ?? attachment;
  const name = attachment?.name ?? attachment?.fileName ?? attachment?.filename ?? "Reference image";

  useEffect(() => {
    let active = true;
    async function resolveUrl() {
      try {
        const directUrl = attachment?.url ?? attachment?.href;
        const result = directUrl || await getAttachmentUrl(id, attachmentId);
        const href = result?.url ?? result?.href ?? result;
        if (active) setState({ loading: false, href: typeof href === "string" ? href : "", error: "" });
      } catch (error) {
        if (active) setState({ loading: false, href: "", error: error?.message || "Attachment unavailable" });
      }
    }
    resolveUrl();
    return () => { active = false; };
  }, [id, attachmentId, attachment?.href, attachment?.url]);

  if (state.loading) {
    return <li className="admin-attachment is-loading" aria-label={`Loading ${name}`}><FileImage size={19} /><span>{name}</span></li>;
  }

  if (state.error || !state.href) {
    return <li className="admin-attachment is-error"><FileImage size={19} /><span>{name}<small>Private link unavailable</small></span></li>;
  }

  return (
    <li>
      <a className="admin-attachment" href={state.href} target="_blank" rel="noreferrer">
        <FileImage size={19} aria-hidden="true" />
        <span>{name}<small>Open private attachment</small></span>
        <ArrowSquareOut size={17} aria-hidden="true" />
      </a>
    </li>
  );
}

function LoginView({ demoMode, onLogin }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    if (!password) {
      setError("Enter the admin password to continue.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await loginAdmin(password);
      if (result?.ok === false || result?.authenticated === false) {
        throw new Error(result.message || result.error || "That password was not accepted.");
      }
      const confirmedSession = await getAdminSession();
      onLogin(confirmedSession?.session ?? confirmedSession ?? result?.session ?? result ?? { authenticated: true });
    } catch (loginError) {
      setError(loginError?.message || "We could not sign you in. Check the password and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-login">
      {demoMode && (
        <div className="admin-demo-banner" role="status">
          <strong>Local demo</strong>
          <span>Bookings and messages stay in this browser. No real email is sent.</span>
        </div>
      )}
      <section className="admin-login__card" aria-labelledby="admin-login-title">
        <a className="admin-login__brand" href="/" aria-label="Rebel Tattoos home">
          <img src="/assets/logo-mark.png" alt="" />
          <img src="/assets/logo-word.png" alt="" />
        </a>
        <div className="admin-login__lock" aria-hidden="true"><LockKey size={22} weight="bold" /></div>
        <h1 id="admin-login-title">Booking desk</h1>
        <p>Sign in to review private booking requests, notes, attachments, and messages.</p>
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="admin-password">Admin password</label>
          <div className="admin-login__password">
            <input
              id="admin-password"
              type={showPassword ? "text" : "password"}
              value={password}
              autoComplete="current-password"
              aria-invalid={Boolean(error)}
              aria-describedby={`${demoMode ? "admin-demo-password " : ""}${error ? "admin-login-error" : ""}`.trim() || undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError("");
              }}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {demoMode && <p className="admin-login__demo-note" id="admin-demo-password">Demo password: <strong>rebel-demo</strong></p>}
          {error && <p className="admin-inline-error" id="admin-login-error" role="alert"><WarningCircle size={18} weight="fill" />{error}</p>}
          <button className="admin-button admin-button--primary admin-login__submit" type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <a className="admin-login__back" href="/"><ArrowLeft size={17} />Back to the website</a>
      </section>
    </main>
  );
}

function DetailSkeleton() {
  return (
    <div className="admin-detail-skeleton" aria-label="Loading booking details" aria-busy="true">
      <span /><span /><span /><span /><span /><span />
    </div>
  );
}

export function AdminPage() {
  const demoMode = useMemo(demoModeEnabled, []);
  const statuses = useMemo(() => normalizeStatuses(statusOptions), []);
  const [session, setSession] = useState(undefined);
  const [bookings, setBookings] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [listState, setListState] = useState({ loading: false, error: "" });
  const [detailState, setDetailState] = useState({ loading: false, error: "" });
  const [statusDraft, setStatusDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [saveState, setSaveState] = useState({ loading: false, message: "", error: "" });
  const [emailAudience, setEmailAudience] = useState("booker");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailState, setEmailState] = useState({ loading: false, message: "", error: "" });

  function handleAdminError(error) {
    if (error?.status !== 401) return false;
    setSession(null);
    setBookings([]);
    setSelectedBooking(null);
    setSelectedId("");
    return true;
  }

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        const result = await getAdminSession();
        if (active) setSession(result?.session ?? result ?? null);
      } catch {
        if (active) setSession(null);
      }
    }
    checkSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    async function load() {
      setListState({ loading: true, error: "" });
      try {
        const result = await listBookings();
        if (result?.ok === false) throw new Error(result.message || result.error || "Bookings could not be loaded.");
        const nextBookings = normalizeBookingList(result);
        if (!active) return;
        setBookings(nextBookings);
        setSelectedId((current) => {
          const requested = new URLSearchParams(window.location.search).get("booking");
          if (requested && nextBookings.some((booking) => String(bookingId(booking)) === requested)) return requested;
          if (current && nextBookings.some((booking) => String(bookingId(booking)) === String(current))) return current;
          return nextBookings[0] ? String(bookingId(nextBookings[0])) : "";
        });
        setListState({ loading: false, error: "" });
      } catch (error) {
        if (active && handleAdminError(error)) return;
        if (active) setListState({ loading: false, error: error?.message || "Bookings could not be loaded." });
      }
    }
    load();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session || !selectedId) {
      setSelectedBooking(null);
      return;
    }
    let active = true;
    async function loadDetail() {
      const listBooking = bookings.find((booking) => String(bookingId(booking)) === String(selectedId));
      if (listBooking) setSelectedBooking(listBooking);
      setDetailState({ loading: true, error: "" });
      try {
        const result = await getBooking(selectedId);
        if (result?.ok === false) throw new Error(result.message || result.error || "This booking could not be loaded.");
        const booking = normalizeBooking(result);
        if (!active) return;
        setSelectedBooking(booking);
        setStatusDraft(booking?.status ?? statuses[0]?.value ?? "new");
        setNotesDraft(firstValue(booking, ["adminNotes", "notes.admin", "privateNotes"], ""));
        setEmailSubject(`Re: Your Rebel Tattoos booking ${firstValue(booking, ["reference", "referenceId"], bookingId(booking))}`);
        setEmailBody("");
        setEmailAudience("booker");
        setSaveState({ loading: false, message: "", error: "" });
        setEmailState({ loading: false, message: "", error: "" });
        setDetailState({ loading: false, error: "" });
      } catch (error) {
        if (active && handleAdminError(error)) return;
        if (active) setDetailState({ loading: false, error: error?.message || "This booking could not be loaded." });
      }
    }
    loadDetail();
    return () => { active = false; };
  }, [selectedId, session]);

  async function reloadBookings() {
    setListState({ loading: true, error: "" });
    try {
      const result = await listBookings();
      if (result?.ok === false) throw new Error(result.message || result.error || "Bookings could not be loaded.");
      setBookings(normalizeBookingList(result));
      setListState({ loading: false, error: "" });
    } catch (error) {
      if (handleAdminError(error)) return;
      setListState({ loading: false, error: error?.message || "Bookings could not be loaded." });
    }
  }

  async function reloadDetail() {
    if (!selectedId) return;
    setDetailState({ loading: true, error: "" });
    try {
      const result = await getBooking(selectedId);
      const booking = normalizeBooking(result);
      if (booking) {
        setSelectedBooking(booking);
        setStatusDraft(booking.status ?? statusDraft);
        setNotesDraft(firstValue(booking, ["adminNotes", "notes.admin", "privateNotes"], ""));
      }
      setDetailState({ loading: false, error: "" });
    } catch (error) {
      if (handleAdminError(error)) return;
      setDetailState({ loading: false, error: error?.message || "This booking could not be loaded." });
    }
  }

  async function handleLogout() {
    try {
      await logoutAdmin();
      setSession(null);
      setBookings([]);
      setSelectedBooking(null);
      setSelectedId("");
    } catch (error) {
      if (handleAdminError(error)) return;
      setListState({ loading: false, error: "Sign out could not complete. Check your connection and try again." });
    }
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!selectedId) return;
    setSaveState({ loading: true, message: "", error: "" });
    try {
      const result = await updateBooking(selectedId, { status: statusDraft, adminNotes: notesDraft });
      if (result?.ok === false) throw new Error(result.message || result.error || "Changes could not be saved.");
      const updated = normalizeBooking(result);
      if (updated && bookingId(updated)) setSelectedBooking(updated);
      else await reloadDetail();
      await reloadBookings();
      setSaveState({ loading: false, message: "Changes saved.", error: "" });
    } catch (error) {
      if (handleAdminError(error)) return;
      setSaveState({ loading: false, message: "", error: error?.message || "Changes could not be saved. Try again." });
    }
  }

  async function handleSendEmail(event) {
    event.preventDefault();
    if (!emailSubject.trim() || !emailBody.trim() || !selectedId) {
      setEmailState({ loading: false, message: "", error: "Add both a subject and message before sending." });
      return;
    }
    setEmailState({ loading: true, message: "", error: "" });
    try {
      const result = await sendBookingEmail(selectedId, {
        audience: emailAudience,
        subject: emailSubject.trim(),
        body: emailBody.trim(),
      });
      if (result?.ok === false) throw new Error(result.message || result.error || "The email could not be sent.");
      await reloadDetail();
      await reloadBookings();
      if (demoMode || result.demo) {
        setEmailBody("");
        setEmailState({ loading: false, message: "Demo message recorded. No real email was sent.", error: "" });
        return;
      }
      const deliveries = Array.isArray(result?.emails) ? result.emails : [];
      const delivered = deliveries.filter((delivery) => delivery.status === "sent");
      const notDelivered = deliveries.filter((delivery) => delivery.status !== "sent");
      if (notDelivered.length) {
        const retryAudiences = notDelivered.map((delivery) => delivery.audience);
        setEmailAudience(retryAudiences.length > 1 ? "both" : retryAudiences[0]);
        setEmailState({
          loading: false,
          message: delivered.length ? `Sent to ${delivered.map((delivery) => humanize(delivery.audience)).join(" and ")}.` : "",
          error: `Not delivered to ${notDelivered.map((delivery) => humanize(delivery.audience)).join(" and ")}. The unsent recipient is selected for a safe retry.`,
        });
      } else {
        setEmailBody("");
        setEmailState({ loading: false, message: "Email sent and added to the booking history.", error: "" });
      }
    } catch (error) {
      if (handleAdminError(error)) return;
      setEmailState({ loading: false, message: "", error: error?.message || "The email could not be sent. Check the details and try again." });
    }
  }

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      const statusMatches = statusFilter === "all" || booking.status === statusFilter;
      const searchable = [
        bookingId(booking),
        firstValue(booking, ["fullName", "name", "booker.name"]),
        firstValue(booking, ["email", "booker.email"]),
        firstValue(booking, ["phone", "booker.phone"]),
        firstValue(booking, ["tattooIdea", "idea", "request.idea"]),
        firstValue(booking, ["placement", "request.placement"]),
      ].join(" ").toLowerCase();
      return statusMatches && (!query || searchable.includes(query));
    });
  }, [bookings, search, statusFilter]);

  const summary = useMemo(() => {
    const count = (matcher) => bookings.filter((booking) => matcher(slugify(booking.status))).length;
    return [
      { label: "New", count: count((status) => status === "new"), match: "new" },
      { label: "Needs reply", count: count((status) => status.includes("reply")), match: "reply" },
      { label: "Awaiting deposit", count: count((status) => status.includes("deposit")), match: "deposit" },
      { label: "Confirmed", count: count((status) => status === "confirmed"), match: "confirmed" },
    ];
  }, [bookings]);

  const selectedAttachments = selectedBooking
    ? firstValue(selectedBooking, ["attachments", "referenceImages", "files", "references"], [])
    : [];
  const attachments = Array.isArray(selectedAttachments) ? selectedAttachments : [];
  const emailHistoryValue = selectedBooking
    ? firstValue(selectedBooking, ["emailHistory", "emails", "messages"], [])
    : [];
  const emailHistory = Array.isArray(emailHistoryValue) ? emailHistoryValue : [];
  const bookerName = selectedBooking ? firstValue(selectedBooking, ["fullName", "name", "booker.name"], "Booker") : "Booker";
  const bookerEmail = selectedBooking ? firstValue(selectedBooking, ["email", "booker.email"], "") : "";
  const reference = selectedBooking ? firstValue(selectedBooking, ["reference", "referenceId"], bookingId(selectedBooking)) : "";

  if (session === undefined) {
    return (
      <main className="admin-login admin-login--checking" aria-busy="true">
        <div className="admin-login__checking"><span /><span /><span /></div>
        <p>Checking admin access…</p>
      </main>
    );
  }

  if (!session) return <LoginView demoMode={demoMode} onLogin={setSession} />;

  return (
    <div className="admin-page">
      <a className="admin-skip-link" href="#admin-main">Skip to bookings</a>
      <header className="admin-topbar">
        <div className="admin-container admin-topbar__inner">
          <a className="admin-brand" href="/" aria-label="Rebel Tattoos home">
            <span className="admin-brand__images"><img src="/assets/logo-mark.png" alt="" /><img src="/assets/logo-word.png" alt="" /></span>
            <span className="admin-brand__label">Admin dashboard</span>
          </a>
          <div className="admin-topbar__actions">
            <a className="admin-button admin-button--quiet admin-topbar__site-link" href="/">View site<ArrowSquareOut size={17} aria-hidden="true" /></a>
            <button className="admin-button admin-button--quiet" type="button" aria-label="Log out of admin" onClick={handleLogout}><SignOut size={18} aria-hidden="true" /><span>Log out</span></button>
          </div>
        </div>
      </header>

      {demoMode && (
        <div className="admin-demo-banner admin-demo-banner--sticky" role="status">
          <strong>Local demo</strong>
          <span>Bookings and message history are stored only in this browser. No real emails are sent.</span>
        </div>
      )}

      <main className="admin-main admin-container" id="admin-main">
        <div className="admin-page-heading">
          <div>
            <h1>Bookings</h1>
            <p>Review every request, keep private notes, and reply from one place.</p>
          </div>
          <button className="admin-button admin-button--secondary" type="button" onClick={reloadBookings} disabled={listState.loading}>
            {listState.loading ? "Refreshing…" : "Refresh queue"}
          </button>
        </div>

        <section className="admin-summary" aria-label="Booking summary">
          {summary.map((item) => {
            const matchingStatus = statuses.find((option) => slugify(option.value).includes(item.match));
            const isActive = matchingStatus && statusFilter === matchingStatus.value;
            return (
              <button
                key={item.label}
                className={isActive ? "is-active" : ""}
                type="button"
                aria-pressed={Boolean(isActive)}
                onClick={() => setStatusFilter(isActive || !matchingStatus ? "all" : matchingStatus.value)}
              >
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </button>
            );
          })}
        </section>

        <div className={`admin-workspace${mobileDetailOpen && selectedId ? " has-mobile-detail" : ""}`}>
          <section className="admin-queue-panel" aria-labelledby="admin-queue-title">
            <div className="admin-queue-toolbar">
              <div>
                <h2 id="admin-queue-title">Booking queue</h2>
                <p>{filteredBookings.length} {filteredBookings.length === 1 ? "request" : "requests"}</p>
              </div>
              <div className="admin-queue-filters">
                <label className="admin-search">
                  <span className="admin-visually-hidden">Search bookings</span>
                  <MagnifyingGlass size={18} aria-hidden="true" />
                  <input type="search" value={search} placeholder="Search name, email, idea…" onChange={(event) => setSearch(event.target.value)} />
                </label>
                <label className="admin-select-wrap">
                  <span className="admin-visually-hidden">Filter by status</span>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="all">All statuses</option>
                    {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  <CaretDown size={16} aria-hidden="true" />
                </label>
              </div>
            </div>

            {listState.error ? (
              <div className="admin-state admin-state--error" role="alert">
                <WarningCircle size={25} weight="fill" aria-hidden="true" />
                <h3>We couldn’t load the queue</h3>
                <p>{listState.error}</p>
                <button className="admin-button admin-button--secondary" type="button" onClick={reloadBookings}>Try again</button>
              </div>
            ) : listState.loading && bookings.length === 0 ? (
              <div className="admin-list-skeleton" aria-label="Loading bookings" aria-busy="true">
                {[0, 1, 2, 3, 4].map((item) => <span key={item} />)}
              </div>
            ) : filteredBookings.length === 0 ? (
              <div className="admin-state">
                <MagnifyingGlass size={25} aria-hidden="true" />
                <h3>{bookings.length ? "No matching bookings" : "No bookings yet"}</h3>
                <p>{bookings.length ? "Clear the search or choose another status." : "New booking requests will appear here as soon as they are submitted."}</p>
                {bookings.length > 0 && <button className="admin-button admin-button--secondary" type="button" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</button>}
              </div>
            ) : (
              <div className="admin-booking-list">
                <div className="admin-booking-list__head" aria-hidden="true"><span>Submitted</span><span>Booker</span><span>Request</span><span>Status</span></div>
                <ul>
                  {filteredBookings.map((booking) => {
                    const id = String(bookingId(booking));
                    const isSelected = id === String(selectedId);
                    return (
                      <li key={id}>
                        <button
                          className={`admin-booking-row${isSelected ? " is-selected" : ""}`}
                          type="button"
                          aria-current={isSelected ? "true" : undefined}
                          onClick={() => { setSelectedId(id); setMobileDetailOpen(true); }}
                        >
                          <span className="admin-booking-row__date"><strong>{formatDate(firstValue(booking, ["createdAt", "submittedAt", "dateCreated"]))}</strong><small>{firstValue(booking, ["reference", "referenceId"], id)}</small></span>
                          <span className="admin-booking-row__booker"><strong>{firstValue(booking, ["fullName", "name", "booker.name"], "Unnamed booking")}</strong><small>{firstValue(booking, ["email", "booker.email"], "No email")}</small></span>
                          <span className="admin-booking-row__request"><strong>{firstValue(booking, ["tattooIdea", "idea", "request.idea"], "No brief provided")}</strong><small>{[firstValue(booking, ["placement", "request.placement"]), firstValue(booking, ["size", "request.size"])].filter(Boolean).join(" · ") || "Details pending"}</small></span>
                          <StatusBadge value={booking.status ?? "new"} options={statuses} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>

          <aside className="admin-detail-panel" aria-label="Booking details">
            {!selectedId ? (
              <div className="admin-state admin-state--detail-empty">
                <UserCircle size={28} aria-hidden="true" />
                <h3>Select a booking</h3>
                <p>Choose a request from the queue to see the complete brief and conversation.</p>
              </div>
            ) : detailState.loading && !selectedBooking ? (
              <DetailSkeleton />
            ) : detailState.error ? (
              <div className="admin-state admin-state--error" role="alert">
                <WarningCircle size={25} weight="fill" aria-hidden="true" />
                <h3>Details unavailable</h3>
                <p>{detailState.error}</p>
                <button className="admin-button admin-button--secondary" type="button" onClick={reloadDetail}>Try again</button>
              </div>
            ) : selectedBooking ? (
              <div className="admin-detail">
                <div className="admin-detail__mobile-bar">
                  <button type="button" onClick={() => setMobileDetailOpen(false)}><ArrowLeft size={18} />Back to bookings</button>
                </div>
                <header className="admin-detail__header">
                  <div>
                    <StatusBadge value={selectedBooking.status ?? "new"} options={statuses} />
                    <h2>{bookerName}</h2>
                    <p>{reference} · Submitted {formatDate(firstValue(selectedBooking, ["createdAt", "submittedAt", "dateCreated"]), true)}</p>
                  </div>
                  <a className="admin-icon-button" href={`mailto:${bookerEmail}`} aria-label={`Open an email to ${bookerName}`}><EnvelopeSimple size={20} /></a>
                </header>

                <section className="admin-detail-section" aria-labelledby="admin-contact-heading">
                  <h3 id="admin-contact-heading">Contact</h3>
                  <dl className="admin-detail-grid">
                    <FieldPair label="Full name" value={bookerName} />
                    <FieldPair label="Email" value={bookerEmail} href={bookerEmail ? `mailto:${bookerEmail}` : undefined} />
                    <FieldPair label="Phone" value={firstValue(selectedBooking, ["phone", "booker.phone"])} href={firstValue(selectedBooking, ["phone", "booker.phone"]) ? `tel:${firstValue(selectedBooking, ["phone", "booker.phone"])}` : undefined} />
                    <FieldPair label="Age confirmed" value={firstValue(selectedBooking, ["ageConfirmed", "consent.ageConfirmed"], false)} />
                  </dl>
                </section>

                <section className="admin-detail-section" aria-labelledby="admin-brief-heading">
                  <h3 id="admin-brief-heading">Tattoo request</h3>
                  <div className="admin-prose-field">
                    <span>Idea</span>
                    <p>{displayValue(firstValue(selectedBooking, ["tattooIdea", "idea", "request.idea"]))}</p>
                  </div>
                  <dl className="admin-detail-grid admin-detail-grid--three">
                    <FieldPair label="Placement" value={firstValue(selectedBooking, ["placement", "request.placement"])} />
                    <FieldPair label="Size" value={firstValue(selectedBooking, ["size", "request.size"])} />
                    <FieldPair label="Style" value={firstValue(selectedBooking, ["style", "request.style"])} />
                    <FieldPair label="Ink" value={firstValue(selectedBooking, ["ink", "request.ink"])} />
                    <FieldPair label="Budget" value={firstValue(selectedBooking, ["budget", "request.budget"])} />
                    <FieldPair label="Preferred date" value={formatDate(firstValue(selectedBooking, ["preferredDate", "request.preferredDate"]))} />
                  </dl>
                  <div className="admin-prose-field">
                    <span>Additional details</span>
                    <p>{displayValue(firstValue(selectedBooking, ["details", "additionalDetails", "request.details"]))}</p>
                  </div>
                </section>

                <section className="admin-detail-section" aria-labelledby="admin-attachments-heading">
                  <div className="admin-detail-section__title-row">
                    <h3 id="admin-attachments-heading">Reference images</h3>
                    <span>{attachments.length}</span>
                  </div>
                  {attachments.length ? (
                    <>
                      <p className="admin-private-note"><LockKey size={14} />Private links. Keep within authorized admin.</p>
                      <ul className="admin-attachment-list">
                        {attachments.map((attachment, index) => <AttachmentLink key={attachment?.id ?? attachment?.name ?? index} booking={selectedBooking} attachment={attachment} />)}
                      </ul>
                    </>
                  ) : <p className="admin-muted-copy">No reference images were attached.</p>}
                </section>

                <form className="admin-detail-section admin-update-form" onSubmit={handleSave}>
                  <h3>Booking update</h3>
                  <label htmlFor="admin-booking-status">Status</label>
                  <span className="admin-select-wrap admin-select-wrap--full">
                    <select id="admin-booking-status" value={statusDraft} onChange={(event) => { setStatusDraft(event.target.value); setSaveState({ loading: false, message: "", error: "" }); }}>
                      {statuses.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <CaretDown size={16} aria-hidden="true" />
                  </span>
                  <label htmlFor="admin-notes">Private admin notes</label>
                  <textarea id="admin-notes" value={notesDraft} placeholder="Add internal context, follow-ups, or pricing notes…" onChange={(event) => { setNotesDraft(event.target.value); setSaveState({ loading: false, message: "", error: "" }); }} />
                  <div className="admin-form-actions">
                    <button className="admin-button admin-button--secondary" type="submit" disabled={saveState.loading}>
                      <FloppyDisk size={18} aria-hidden="true" />{saveState.loading ? "Saving…" : "Save update"}
                    </button>
                    {saveState.message && <p className="admin-success-message" role="status"><Check size={17} weight="bold" />{saveState.message}</p>}
                  </div>
                  {saveState.error && <p className="admin-inline-error" role="alert"><WarningCircle size={18} weight="fill" />{saveState.error}</p>}
                </form>

                <form className="admin-detail-section admin-email-form" onSubmit={handleSendEmail}>
                  <div className="admin-detail-section__title-row">
                    <h3>Email</h3>
                    <EnvelopeSimple size={20} aria-hidden="true" />
                  </div>
                  <fieldset>
                    <legend>Send to</legend>
                    <div className="admin-segmented-control">
                      {[{ value: "booker", label: "Booker" }, { value: "admin", label: "Admin" }, { value: "both", label: "Both" }].map((option) => (
                        <label key={option.value}>
                          <input type="radio" name="email-audience" value={option.value} checked={emailAudience === option.value} onChange={(event) => setEmailAudience(event.target.value)} />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="admin-email-recipient">
                    {emailAudience === "booker" && <>To: {bookerEmail || "No booker email available"}</>}
                    {emailAudience === "admin" && <>To: {session.adminEmail || "Admin"}</>}
                    {emailAudience === "both" && <>To: {bookerEmail || "Booker email missing"} and {session.adminEmail || "Admin"}</>}
                  </p>
                  {session.emailConfigured === false && (
                    <p className="admin-email-warning" role="status">
                      <WarningCircle size={16} weight="fill" aria-hidden="true" />
                      {demoMode ? "Email delivery is disabled in this local demo. Messages are recorded in history only." : "Email delivery is not configured. Connect the mail service before sending."}
                    </p>
                  )}
                  <label htmlFor="admin-email-subject">Subject</label>
                  <input id="admin-email-subject" type="text" value={emailSubject} onChange={(event) => { setEmailSubject(event.target.value); setEmailState({ loading: false, message: "", error: "" }); }} />
                  <label htmlFor="admin-email-body">Message</label>
                  <textarea id="admin-email-body" value={emailBody} placeholder="Write a clear next step for this booking…" onChange={(event) => { setEmailBody(event.target.value); setEmailState({ loading: false, message: "", error: "" }); }} />
                  <button
                    className="admin-button admin-button--primary"
                    type="submit"
                    disabled={emailState.loading || !emailSubject.trim() || !emailBody.trim() || (emailAudience !== "admin" && !bookerEmail) || (!demoMode && session.emailConfigured === false)}
                  >
                    <EnvelopeSimple size={18} aria-hidden="true" />{emailState.loading ? "Sending…" : demoMode ? "Record demo email" : "Send email"}
                  </button>
                  {emailState.message && <p className="admin-success-message" role="status"><Check size={17} weight="bold" />{emailState.message}</p>}
                  {emailState.error && <p className="admin-inline-error" role="alert"><WarningCircle size={18} weight="fill" />{emailState.error}</p>}
                </form>

                <section className="admin-detail-section" aria-labelledby="admin-history-heading">
                  <div className="admin-detail-section__title-row">
                    <h3 id="admin-history-heading">Email history</h3>
                    <span>{emailHistory.length}</span>
                  </div>
                  {emailHistory.length ? (
                    <ol className="admin-email-history">
                      {emailHistory.map((message, index) => (
                        <li key={message.id ?? `${message.sentAt ?? message.createdAt}-${index}`}>
                          <span className="admin-email-history__icon"><EnvelopeSimple size={16} aria-hidden="true" /></span>
                          <div>
                            <div><strong>{message.subject || "Email"}</strong><time>{formatDate(message.sentAt ?? message.createdAt, true)}</time></div>
                            <p className={`admin-email-history__status is-${slugify(message.status || "pending")}`}>
                              {message.status === "sent" ? "Sent to" : message.status === "failed" ? "Failed for" : "Not delivered to"} {humanize(message.audience ?? message.to ?? "booker")}
                            </p>
                            {message.lastError && <p>{message.lastError}</p>}
                            {message.body && <details><summary>Read message</summary><p>{message.body}</p></details>}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="admin-history-empty"><NotePencil size={21} aria-hidden="true" /><p>No emails have been sent for this booking yet.</p></div>
                  )}
                </section>
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}
