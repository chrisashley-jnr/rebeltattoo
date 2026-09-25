import { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  CheckCircle,
  CircleNotch,
  FileImage,
  HouseLine,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { PageShell, SectionEyebrow } from "../components.jsx";
import { isDemoMode, submitBooking } from "../bookingService.js";
import { images } from "../data.js";
import "./BookingPage.css";

const initialValues = {
  fullName: "",
  email: "",
  phone: "",
  tattooIdea: "",
  placement: "",
  size: "",
  style: "",
  ink: "",
  budget: "",
  preferredDate: "",
  details: "",
  ageConfirmed: false,
  website: "",
};

const selectOptions = {
  placement: ["Upper arm", "Forearm", "Shoulder", "Back", "Rib", "Thigh", "Calf", "Ankle", "Other / not sure"],
  size: ["Tiny (under 5 cm)", "Palm-sized", "Hand-sized", "Larger piece", "Not sure yet"],
  style: ["Fine line", "Botanical", "Celestial", "Blackwork", "Illustrative", "Not sure yet"],
  ink: ["Black ink", "Colour", "Black and colour", "Not sure yet"],
  budget: ["Under GHS 1,000", "GHS 1,000–2,500", "GHS 2,500–5,000", "GHS 5,000+", "I need guidance"],
};

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = new Set(["image/jpeg", "image/png"]);

function localDateString() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateField(name, value) {
  switch (name) {
    case "fullName":
      return value.trim().length >= 2 ? "" : "Enter the name you use for bookings.";
    case "email":
      if (!value.trim()) return "Enter an email address so we can reply.";
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? "" : "Enter a complete email address, such as name@example.com.";
    case "phone": {
      if (!value.trim()) return "Enter a phone number for appointment coordination.";
      const digits = value.replace(/\D/g, "");
      return /^\+?[\d\s().-]{7,30}$/.test(value) && digits.length >= 7 && digits.length <= 15
        ? ""
        : "Enter a phone number with 7–15 digits.";
    }
    case "tattooIdea":
      return value.trim().length >= 20 ? "" : "Share at least a sentence about the story, style, or feeling.";
    case "placement":
      return value ? "" : "Choose the closest placement.";
    case "size":
      return value ? "" : "Choose an approximate size.";
    case "style":
      return value ? "" : "Choose the style that feels closest.";
    case "ink":
      return value ? "" : "Choose an ink preference.";
    case "budget":
      return value ? "" : "Choose a budget range so we can suggest the right scope.";
    case "preferredDate":
      if (!value) return "Choose a preferred date.";
      return value >= localDateString() ? "" : "Choose today or a future date.";
    case "ageConfirmed":
      return value ? "" : "Confirm that you are 18 or older before sending your request.";
    default:
      return "";
  }
}

function FieldMessage({ id, helper, error }) {
  return (
    <p id={id} className={`booking-field__message${error ? " is-error" : ""}`} role={error ? "alert" : undefined}>
      {error || helper}
    </p>
  );
}

function TextField({
  area,
  id,
  label,
  helper,
  error,
  multiline = false,
  required = false,
  ...controlProps
}) {
  const messageId = `${id}-message`;
  const Control = multiline ? "textarea" : "input";

  return (
    <div className={`booking-field booking-field--${area}`}>
      <label className="booking-field__label" htmlFor={id}>{label}</label>
      <Control
        {...controlProps}
        id={id}
        name={id}
        className="booking-field__control"
        aria-describedby={helper || error ? messageId : undefined}
        aria-invalid={Boolean(error)}
        required={required}
      />
      {(helper || error) && <FieldMessage id={messageId} helper={helper} error={error} />}
    </div>
  );
}

function SelectField({ area, id, label, helper, error, options, placeholder, ...controlProps }) {
  const messageId = `${id}-message`;

  return (
    <div className={`booking-field booking-field--${area}`}>
      <label className="booking-field__label" htmlFor={id}>{label}</label>
      <span className="booking-select">
        <select
          {...controlProps}
          id={id}
          name={id}
          className="booking-field__control"
          aria-describedby={messageId}
          aria-invalid={Boolean(error)}
          required
        >
          <option value="">{placeholder}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <CaretDown className="booking-select__icon" size={17} weight="bold" aria-hidden="true" />
      </span>
      <FieldMessage id={messageId} helper={helper} error={error} />
    </div>
  );
}

function UploadField({ files, error, isDragging, onAddFiles, onRemoveFile, onDragStateChange }) {
  const messageId = "referenceImages-message";

  function handleDrop(event) {
    event.preventDefault();
    onDragStateChange(false);
    onAddFiles(event.dataTransfer.files);
  }

  return (
    <div className="booking-field booking-field--upload">
      <span className="booking-field__label" id="referenceImages-label">Reference images</span>
      <label
        className={`booking-upload${isDragging ? " is-dragging" : ""}`}
        htmlFor="referenceImages"
        onDragEnter={(event) => {
          event.preventDefault();
          onDragStateChange(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onDragStateChange(false);
        }}
        onDrop={handleDrop}
      >
        <input
          id="referenceImages"
          name="referenceImages"
          className="booking-upload__native"
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          multiple
          aria-labelledby="referenceImages-label"
          aria-describedby={messageId}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            onAddFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <UploadSimple size={25} weight="bold" aria-hidden="true" />
        <span>Drop files here or <strong>browse</strong></span>
      </label>
      <FieldMessage id={messageId} helper="Up to 5 JPG or PNG files, 10 MB each." error={error} />
      {files.length > 0 && (
        <ul className="booking-upload__files" aria-label="Selected reference images" aria-live="polite">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              <FileImage size={19} weight="duotone" aria-hidden="true" />
              <span className="booking-upload__file-copy">
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.size)}</small>
              </span>
              <button type="button" onClick={() => onRemoveFile(index)} aria-label={`Remove ${file.name}`}>
                <X size={17} weight="bold" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BookingPage() {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [files, setFiles] = useState([]);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const formRef = useRef(null);
  const successHeadingRef = useRef(null);
  const submissionKeyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    if (confirmation) successHeadingRef.current?.focus();
  }, [confirmation]);

  function updateValue(event) {
    const { name, type, checked, value } = event.target;
    const nextValue = type === "checkbox" ? checked : value;
    setValues((current) => ({ ...current, [name]: nextValue }));
    if (errors[name]) setErrors((current) => ({ ...current, [name]: "" }));
  }

  function validateOnBlur(event) {
    const { name, type, checked, value } = event.target;
    const message = validateField(name, type === "checkbox" ? checked : value);
    setErrors((current) => ({ ...current, [name]: message }));
  }

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const unsupported = incoming.filter((file) => !ACCEPTED_FILE_TYPES.has(file.type));
    const oversized = incoming.filter((file) => file.size > MAX_FILE_SIZE);
    const validIncoming = incoming.filter((file) => ACCEPTED_FILE_TYPES.has(file.type) && file.size <= MAX_FILE_SIZE);

    setFiles((current) => {
      const next = [...current];
      validIncoming.forEach((file) => {
        const duplicate = next.some((saved) => saved.name === file.name && saved.size === file.size && saved.lastModified === file.lastModified);
        if (!duplicate && next.length < MAX_FILES) next.push(file);
      });
      return next;
    });

    if (unsupported.length) {
      setFileError("Use JPG or PNG files only.");
    } else if (oversized.length) {
      setFileError("Each image must be 10 MB or smaller.");
    } else if (files.length + validIncoming.length > MAX_FILES) {
      setFileError(`Choose no more than ${MAX_FILES} images.`);
    } else {
      setFileError("");
    }
  }

  function removeFile(index) {
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
    setFileError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const fieldsToValidate = ["fullName", "email", "phone", "tattooIdea", "placement", "size", "style", "ink", "budget", "preferredDate", "ageConfirmed"];
    const nextErrors = fieldsToValidate.reduce((result, field) => {
      const message = validateField(field, values[field]);
      if (message) result[field] = message;
      return result;
    }, {});

    setErrors(nextErrors);
    const firstInvalidField = fieldsToValidate.find((field) => nextErrors[field]);

    if (firstInvalidField) {
      requestAnimationFrame(() => {
        formRef.current?.querySelector(`[name="${firstInvalidField}"]`)?.focus();
      });
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);
    try {
      const result = await submitBooking(values, files, submissionKeyRef.current);
      setConfirmation({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        reference: result.booking?.reference || "",
        notifications: result.notifications,
      });
    } catch (error) {
      if (error.fields) {
        setErrors((current) => ({ ...current, ...error.fields }));
        if (error.fields.referenceImages) setFileError(error.fields.referenceImages);
      }
      setSubmitError(error.message || "We could not save your request. Please try again.");
      requestAnimationFrame(() => formRef.current?.querySelector("[aria-invalid='true']")?.focus());
    } finally {
      setIsSubmitting(false);
    }
  }

  function resetForm() {
    setValues(initialValues);
    setErrors({});
    setFiles([]);
    setFileError("");
    setSubmitError("");
    setConfirmation(null);
    submissionKeyRef.current = crypto.randomUUID();
    requestAnimationFrame(() => formRef.current?.elements.fullName?.focus());
  }

  const commonFieldProps = (name) => ({
    value: values[name],
    error: errors[name],
    onChange: updateValue,
    onBlur: validateOnBlur,
  });

  return (
    <PageShell>
      <div className="booking-page">
        <section className="booking-hero" aria-labelledby="booking-title">
          <div className="booking-container booking-hero__inner">
            <div className="booking-hero__copy">
              <SectionEyebrow>Home service appointments</SectionEyebrow>
              <h1 id="booking-title">
                <span>Book a</span>
                <span>home <span className="booking-hero__mobile-break">session.</span></span>
              </h1>
              <p>
                Rebel Tattoos is exclusively a home service. Michelle brings all professional sterilized equipment, a portable ergonomic setup, and lighting directly to your home in Accra.
              </p>
              <div className="booking-hero__badge">
                <HouseLine size={20} weight="duotone" aria-hidden="true" />
                <span>Home service only · Comfortable &amp; private in your own space</span>
              </div>
            </div>
            <figure className="booking-hero__media">
              <img src={images.hero} alt="Michelle preparing equipment for a private tattoo session" width="1586" height="992" decoding="async" />
              <figcaption>Home service only</figcaption>
            </figure>
          </div>
        </section>

        <section className="booking-main-section" aria-labelledby={confirmation ? "booking-success-title" : "booking-form-title"}>
          <div className="booking-container booking-main__layout">
            {confirmation ? (
              <section className="booking-success" aria-labelledby="booking-success-title">
                <CheckCircle size={42} weight="fill" aria-hidden="true" />
                <p className="booking-success__eyebrow">Request received</p>
                <h2 id="booking-success-title" ref={successHeadingRef} tabIndex="-1">Your idea is in.</h2>
                <p>Thanks, {confirmation.fullName}. We’ll use <strong>{confirmation.email}</strong> to share timing, pricing, and home session logistics within 2–3 business days.</p>
                {confirmation.reference && <p className="booking-success__reference">Reference: <strong>{confirmation.reference}</strong></p>}
                {confirmation.notifications === "demo" && <p className="booking-success__demo">Local demo: the request is visible in the admin dashboard, but no email was delivered.</p>}
                {confirmation.notifications === "pending_configuration" && <p className="booking-success__demo" role="status">Your request was saved, but email delivery is not configured. Keep your reference number while the studio follows up.</p>}
                {confirmation.notifications === "queued" && <p className="booking-success__demo" role="status">A confirmation email is being sent. Please allow a few minutes and check your spam folder if it does not appear.</p>}
                <p className="booking-success__note">Your appointment is confirmed only after design approval and deposit.</p>
                <button className="booking-button booking-button--outline" type="button" onClick={resetForm}>Send another request</button>
              </section>
            ) : (
              <form className="booking-form" ref={formRef} onSubmit={handleSubmit} noValidate>
                <h2 id="booking-form-title">Tell us about your idea</h2>
                <p className="booking-form__subtitle">
                  Fill in your details below and Michelle will prepare a personalized quote and home appointment options.
                </p>
                {isDemoMode && (
                  <div className="booking-form__demo" role="note">
                    Local demo — requests stay in this browser session and emails are not delivered.
                  </div>
                )}
                {(Object.values(errors).some(Boolean) || submitError) && (
                  <div className="booking-form__alert" role="alert">
                    <WarningCircle size={21} weight="fill" aria-hidden="true" />
                    <span>{submitError || "Review the highlighted fields, then send your request again."}</span>
                  </div>
                )}

                <div className="booking-honeypot" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" tabIndex="-1" autoComplete="off" value={values.website} onChange={updateValue} />
                </div>

                <div className="booking-form__grid">
                  <TextField
                    area="name"
                    id="fullName"
                    label="Full name"
                    placeholder="Your name"
                    autoComplete="name"
                    required
                    {...commonFieldProps("fullName")}
                  />
                  <TextField
                    area="email"
                    id="email"
                    label="Email address"
                    helper="We’ll reply here."
                    type="email"
                    inputMode="email"
                    placeholder="you@email.com"
                    autoComplete="email"
                    required
                    {...commonFieldProps("email")}
                  />
                  <TextField
                    area="phone"
                    id="phone"
                    label="Phone number"
                    helper="For appointment coordination &amp; WhatsApp updates."
                    type="tel"
                    inputMode="tel"
                    placeholder="+233 / your number"
                    autoComplete="tel"
                    required
                    {...commonFieldProps("phone")}
                  />
                  <TextField
                    area="idea"
                    id="tattooIdea"
                    label="Tattoo idea"
                    helper="A few sentences is perfect."
                    placeholder="Tell us the story, style, and feeling…"
                    multiline
                    required
                    {...commonFieldProps("tattooIdea")}
                  />
                  <SelectField
                    area="placement"
                    id="placement"
                    label="Placement"
                    helper="Choose the closest option."
                    placeholder="Choose a placement"
                    options={selectOptions.placement}
                    {...commonFieldProps("placement")}
                  />
                  <SelectField
                    area="size"
                    id="size"
                    label="Approximate size"
                    helper="Palm-sized, hand-sized, or larger."
                    placeholder="Choose a size"
                    options={selectOptions.size}
                    {...commonFieldProps("size")}
                  />
                  <SelectField
                    area="style"
                    id="style"
                    label="Style"
                    helper="Fine line, botanical, celestial…"
                    placeholder="Choose a style"
                    options={selectOptions.style}
                    {...commonFieldProps("style")}
                  />
                  <SelectField
                    area="ink"
                    id="ink"
                    label="Black ink or colour?"
                    helper="We can discuss details later."
                    placeholder="Choose one"
                    options={selectOptions.ink}
                    {...commonFieldProps("ink")}
                  />
                  <SelectField
                    area="budget"
                    id="budget"
                    label="Budget range"
                    helper="This helps recommend the right scope."
                    placeholder="Choose a range"
                    options={selectOptions.budget}
                    {...commonFieldProps("budget")}
                  />
                  <TextField
                    area="date"
                    id="preferredDate"
                    label="Preferred date"
                    helper="Choose a starting date; we’ll confirm availability."
                    type="date"
                    min={localDateString()}
                    required
                    {...commonFieldProps("preferredDate")}
                  />
                  <UploadField
                    files={files}
                    error={fileError}
                    isDragging={isDragging}
                    onAddFiles={addFiles}
                    onRemoveFile={removeFile}
                    onDragStateChange={setIsDragging}
                  />
                  <TextField
                    area="details"
                    id="details"
                    label="Home location &amp; notes"
                    helper="Your area/neighborhood in Accra and any special preferences."
                    placeholder="Area (e.g. East Legon, Cantonments, Airport Hills, Osu) and any questions…"
                    multiline
                    {...commonFieldProps("details")}
                  />
                </div>

                <label className={`booking-consent${errors.ageConfirmed ? " is-error" : ""}`}>
                  <input
                    type="checkbox"
                    name="ageConfirmed"
                    checked={values.ageConfirmed}
                    aria-describedby="ageConfirmed-message"
                    aria-invalid={Boolean(errors.ageConfirmed)}
                    onChange={updateValue}
                    onBlur={validateOnBlur}
                  />
                  <span>I confirm that I’m 18 or older and understand this request initiates consultation for a home service booking.</span>
                </label>
                <p id="ageConfirmed-message" className="booking-consent__error" aria-live="polite">{errors.ageConfirmed}</p>

                <button className="booking-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <CircleNotch className="booking-button__spinner" size={18} weight="bold" aria-hidden="true" />}
                  {isSubmitting ? "Sending request…" : "Send booking request"}
                </button>
              </form>
            )}

            <aside className="booking-aside" aria-label="Booking information">
              <section className="booking-info-card booking-info-card--dark">
                <h2>Home service details</h2>
                <dl>
                  <div><dt>Service format</dt><dd>Exclusively home service</dd></div>
                  <div><dt>Coverage</dt><dd>Accra &amp; surrounding areas</dd></div>
                  <div><dt>Setup provided</dt><dd>Sterile equipment, portable chair/bed, lighting</dd></div>
                  <div><dt>Response time</dt><dd>2–3 business days</dd></div>
                </dl>
                <p>Michelle arrives with a complete hospital-grade sanitized kit so you can get tattooed comfortably at home.</p>
              </section>

              <section className="booking-info-card booking-info-card--blue">
                <h2>A calm, private process</h2>
                <ul>
                  <li>Original work, drawn specifically for you</li>
                  <li>Transparent estimates before booking</li>
                  <li>Full hygiene setup &amp; aftercare pack provided</li>
                </ul>
              </section>

              <section className="booking-info-card booking-info-card--paper">
                <h2>After submitting</h2>
                <p>Your idea is in. Expect a reply within 2–3 business days with date availability and pricing.</p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
