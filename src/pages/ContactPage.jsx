import { useEffect, useRef, useState } from "react";
import {
  CaretDown,
  CheckCircle,
  CircleNotch,
  FileImage,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { PageShell, SectionEyebrow } from "../components.jsx";
import { isDemoMode, submitBooking } from "../bookingService.js";
import { images } from "../data.js";
import "./ContactPage.css";

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
  size: ["Tiny (under 5 cm)", "Palm-sized", "Hand-sized", "Larger / custom", "Not sure yet"],
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
      if (!value.trim()) return "";
      const digits = value.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15 ? "" : "Enter a phone number with 7–15 digits, or leave this blank.";
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
    <p id={id} className={`contact-field__message${error ? " is-error" : ""}`} role={error ? "alert" : undefined}>
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
    <div className={`contact-field contact-field--${area}`}>
      <label className="contact-field__label" htmlFor={id}>{label}</label>
      <Control
        {...controlProps}
        id={id}
        name={id}
        className="contact-field__control"
        aria-describedby={messageId}
        aria-invalid={Boolean(error)}
        required={required}
      />
      <FieldMessage id={messageId} helper={helper} error={error} />
    </div>
  );
}

function SelectField({ area, id, label, helper, error, options, placeholder, ...controlProps }) {
  const messageId = `${id}-message`;

  return (
    <div className={`contact-field contact-field--${area}`}>
      <label className="contact-field__label" htmlFor={id}>{label}</label>
      <span className="contact-select">
        <select
          {...controlProps}
          id={id}
          name={id}
          className="contact-field__control"
          aria-describedby={messageId}
          aria-invalid={Boolean(error)}
          required
        >
          <option value="">{placeholder}</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <CaretDown className="contact-select__icon" size={17} weight="bold" aria-hidden="true" />
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
    <div className="contact-field contact-field--upload">
      <span className="contact-field__label" id="referenceImages-label">Reference images</span>
      <label
        className={`contact-upload${isDragging ? " is-dragging" : ""}`}
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
          className="contact-upload__native"
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
        <ul className="contact-upload__files" aria-label="Selected reference images" aria-live="polite">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}`}>
              <FileImage size={19} weight="duotone" aria-hidden="true" />
              <span className="contact-upload__file-copy">
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

export function ContactPage() {
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
      const result = await submitBooking(values, files);
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
      <div className="contact-page">
        <section className="contact-hero" aria-labelledby="contact-title">
          <div className="contact-container contact-hero__inner">
            <div className="contact-hero__copy">
              <SectionEyebrow>Bookings &amp; enquiries</SectionEyebrow>
              <h1 id="contact-title">
                <span>Let’s make</span>
                <span>something <span className="contact-hero__mobile-break">personal.</span></span>
              </h1>
              <p>Share your idea below. The more detail you include, the easier it is to recommend the right size, placement, and session.</p>
            </div>
            <figure className="contact-hero__media">
              <img src={images.studio} alt="Calm private tattoo studio with an adjustable tattoo chair" />
              <figcaption>Appointment only</figcaption>
            </figure>
          </div>
        </section>

        <section className="contact-booking" aria-labelledby={confirmation ? "contact-success-title" : "booking-form-title"}>
          <div className="contact-container contact-booking__layout">
            {confirmation ? (
              <section className="contact-success" aria-labelledby="contact-success-title">
                <CheckCircle size={42} weight="fill" aria-hidden="true" />
                <p className="contact-success__eyebrow">Request received</p>
                <h2 id="contact-success-title" ref={successHeadingRef} tabIndex="-1">Your idea is in.</h2>
                <p>Thanks, {confirmation.fullName}. We’ll use <strong>{confirmation.email}</strong> to share timing, pricing, and a clear next step within 2–3 business days.</p>
                {confirmation.reference && <p className="contact-success__reference">Reference: <strong>{confirmation.reference}</strong></p>}
                {confirmation.notifications === "demo" && <p className="contact-success__demo">Local demo: the request is visible in the admin dashboard, but no email was delivered.</p>}
                <p className="contact-success__note">Your appointment is confirmed only after design approval and deposit.</p>
                <button className="contact-button contact-button--outline" type="button" onClick={resetForm}>Send another request</button>
              </section>
            ) : (
              <form className="contact-form" ref={formRef} onSubmit={handleSubmit} noValidate>
                <h2 id="booking-form-title">Tell us about your idea</h2>
                {isDemoMode && (
                  <div className="contact-form__demo" role="note">
                    Local demo — requests stay in this browser session and emails are not delivered.
                  </div>
                )}
                {(Object.values(errors).some(Boolean) || submitError) && (
                  <div className="contact-form__alert" role="alert">
                    <WarningCircle size={21} weight="fill" aria-hidden="true" />
                    <span>{submitError || "Review the highlighted fields, then send your request again."}</span>
                  </div>
                )}

                <div className="contact-honeypot" aria-hidden="true">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" tabIndex="-1" autoComplete="off" value={values.website} onChange={updateValue} />
                </div>

                <div className="contact-form__grid">
                  <TextField
                    area="name"
                    id="fullName"
                    label="Full name"
                    helper="As it appears on your ID."
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
                    label="Phone number (optional)"
                    helper="Only used for appointment updates."
                    type="tel"
                    inputMode="tel"
                    placeholder="+233 / your number"
                    autoComplete="tel"
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
                    helper="Palm-sized, hand-sized, or custom."
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
                    helper="Choose a starting point; we’ll confirm alternatives by email."
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
                    label="Anything else we should know?"
                    helper="Optional, but helpful."
                    placeholder="Accessibility needs, sensitivities, or questions…"
                    multiline
                    {...commonFieldProps("details")}
                  />
                </div>

                <label className={`contact-consent${errors.ageConfirmed ? " is-error" : ""}`}>
                  <input
                    type="checkbox"
                    name="ageConfirmed"
                    checked={values.ageConfirmed}
                    aria-describedby="ageConfirmed-message"
                    aria-invalid={Boolean(errors.ageConfirmed)}
                    onChange={updateValue}
                    onBlur={validateOnBlur}
                  />
                  <span>I confirm that I’m 18 or older and understand this request does not confirm an appointment.</span>
                </label>
                <p id="ageConfirmed-message" className="contact-consent__error" aria-live="polite">{errors.ageConfirmed}</p>

                <button className="contact-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting && <CircleNotch className="contact-button__spinner" size={18} weight="bold" aria-hidden="true" />}
                  {isSubmitting ? "Sending request…" : "Send booking request"}
                </button>
              </form>
            )}

            <aside className="contact-booking__aside" aria-label="Booking information">
              <section className="contact-info-card contact-info-card--dark">
                <h2>Before you send</h2>
                <dl>
                  <div><dt>Studio visits</dt><dd>By appointment only</dd></div>
                  <div><dt>Response time</dt><dd>2–3 business days</dd></div>
                  <div><dt>What happens next</dt><dd>You’ll receive timing, pricing, and a clear next step by email.</dd></div>
                </dl>
                <p>This form starts a conversation. Your date is confirmed only after design approval and deposit.</p>
              </section>

              <section className="contact-info-card contact-info-card--blue">
                <h2>A calm, clear process</h2>
                <ul>
                  <li>Original work, drawn for you</li>
                  <li>Transparent estimates before booking</li>
                  <li>Guidance before and after your appointment</li>
                </ul>
              </section>

              <section className="contact-info-card contact-info-card--paper">
                <h2>After submitting</h2>
                <p>Your idea is in. Expect a reply within 2–3 business days.</p>
              </section>
            </aside>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
