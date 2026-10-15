import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Save,
  User,
} from "lucide-react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

import {
  getLearnerFullName,
} from "./LearnerData";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import type { Learner } from "./LearnerData";
import { currentUser } from "../../config/currentUser";

export default function EditLearnerPage() {
  const navigate = useNavigate();
  const { learnerId } = useParams();
  const workspace = useAcademicWorkspace();
  const canManageLearners = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("users.manage");

  const learner = workspace.learners.find(
    (item) => item.id === learnerId,
  );

  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState<Omit<Learner, "id">>(() => ({
    admissionNumber: learner?.admissionNumber ?? "",
    firstName: learner?.firstName ?? "",
    otherName: learner?.otherName ?? "",
    lastName: learner?.lastName ?? "",
    gender: learner?.gender ?? "Unspecified",
    dateOfBirth: learner?.dateOfBirth ?? "",
    programme: learner?.programme ?? "O-Level",
    className: learner?.className ?? "Senior 1",
    stream: learner?.stream ?? "",
    admissionDate: learner?.admissionDate ?? "",
    guardianName: learner?.guardianName ?? "",
    guardianPhone: learner?.guardianPhone ?? "",
    status: learner?.status ?? "Active",
  }));

  if (!canManageLearners) {
    return <section className="panel class-not-found"><h1>Administrator access required</h1><p>Only the School Administrator can edit learner records. Contact your School Administrator if this learner record needs correction.</p><button type="button" className="secondary-button" onClick={() => navigate(learner ? `/school/learners/${learner.id}` : "/school/learners")}>Return to learner profile</button></section>;
  }

  if (!learner) {
    return (
      <section className="teacher-not-found">
        <User size={36} />

        <h1>Learner not found</h1>

        <p>
          The requested learner record could not be found.
        </p>

        <button
          type="button"
          className="primary-button"
          onClick={() => navigate("/school/learners")}
        >
          Return to Learners
        </button>
      </section>
    );
  }

  function updateField(
    field: keyof typeof form,
    value: string,
  ) {
    setSaved(false);
    setError("");

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const result = workspace.updateLearner(learner!.id, form);
    if (result) { setError(result); return; }
    setSaved(true);
  }

  return (
    <>
      <button
        type="button"
        className="profile-back-button"
        onClick={() =>
          navigate(`/school/learners/${learner.id}`)
        }
      >
        <ArrowLeft size={16} />
        Back to Learner Profile
      </button>

      <header className="page-heading">
        <div>
          <span className="eyebrow">
            LEARNER MANAGEMENT
          </span>

          <h1>Edit Learner</h1>

          <p>
            Update the record for{" "}
            {getLearnerFullName(learner)}.
          </p>
        </div>
      </header>

      {saved && (
        <div className="form-success-message">
          Learner updated in this review session. The register and marks rosters now use this record; it is not stored online.
        </div>
      )}
      {error && <div className="form-error-message" role="alert">{error}</div>}

      <form onSubmit={handleSubmit}>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Personal Information</h2>
              <p>
                Update learner identity information.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="edit-admission">
                Admission Number
              </label>

              <input
                id="edit-admission"
                required={Boolean(learner.admissionNumber)}
                value={form.admissionNumber}
                onChange={(event) =>
                  updateField(
                    "admissionNumber",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-first-name">
                First Name
              </label>

              <input
                id="edit-first-name"
                required
                value={form.firstName}
                onChange={(event) =>
                  updateField(
                    "firstName",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-other-name">
                Other Name
              </label>

              <input
                id="edit-other-name"
                value={form.otherName}
                onChange={(event) =>
                  updateField(
                    "otherName",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-last-name">
                Last Name
              </label>

              <input
                id="edit-last-name"
                required
                value={form.lastName}
                onChange={(event) =>
                  updateField(
                    "lastName",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-gender">
                Gender
              </label>

              <select
                id="edit-gender"
                value={form.gender}
                onChange={(event) =>
                  updateField(
                    "gender",
                    event.target.value,
                  )
                }
              >
                <option value="Unspecified">Unspecified</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="edit-dob">
                Date of Birth
              </label>

              <input
                id="edit-dob"
                type="date"
                value={form.dateOfBirth}
                onChange={(event) =>
                  updateField(
                    "dateOfBirth",
                    event.target.value,
                  )
                }
              />
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Academic Enrolment</h2>
              <p>
                Current placement is shown for reference. Changes require a dated enrolment-history workflow.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="edit-programme">
                Programme
              </label>

              <select
                id="edit-programme"
                disabled
                value={form.programme}
                onChange={(event) =>
                  updateField(
                    "programme",
                    event.target.value,
                  )
                }
              >
                <option value="O-Level">O-Level</option>
                <option value="A-Level">A-Level</option>
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="edit-class">
                Class
              </label>

              <select
                id="edit-class"
                disabled
                value={form.className}
                onChange={(event) =>
                  updateField(
                    "className",
                    event.target.value,
                  )
                }
              >
                {workspace.classes.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="edit-stream">
                Stream
              </label>

              <input
                id="edit-stream"
                disabled
                value={form.stream}
                onChange={(event) =>
                  updateField(
                    "stream",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-status">
                Status
              </label>

              <select
                id="edit-status"
                disabled
                value={form.status}
                onChange={(event) =>
                  updateField(
                    "status",
                    event.target.value,
                  )
                }
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="Transferred">
                  Transferred
                </option>
              </select>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Parent / Guardian</h2>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="edit-guardian">
                Guardian Name
              </label>

              <input
                id="edit-guardian"
                value={form.guardianName}
                onChange={(event) =>
                  updateField(
                    "guardianName",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-field">
              <label htmlFor="edit-phone">
                Guardian Phone
              </label>

              <input
                id="edit-phone"
                type="tel"
                value={form.guardianPhone}
                onChange={(event) =>
                  updateField(
                    "guardianPhone",
                    event.target.value,
                  )
                }
              />
            </div>
          </div>
        </section>

        <div className="form-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(`/school/learners/${learner.id}`)
            }
          >
            Cancel
          </button>

          <button
            type="submit"
            className="primary-button"
          >
            <Save size={17} />
            Save Changes
          </button>
        </div>
      </form>
    </>
  );
}
