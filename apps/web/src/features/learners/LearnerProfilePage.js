import { ArrowLeft, BookOpen, CalendarDays, Pencil, Phone, ShieldCheck, User, Users, } from "lucide-react";
import { useNavigate, useParams, useSearchParams, } from "react-router-dom";
import { getLearnerFullName, getLearnerInitials, } from "./LearnerData";
import { DeleteRecordButton } from "../../components/DeleteRecordButton";
import { MediaAssetEditor } from "../../components/common/MediaAssetEditor";
import { useAcademicWorkspace } from "../academicSetup/AcademicWorkspace";
import { safeInternalReturnTo } from "../../utils/safeNavigation";
import { currentUser } from "../../config/currentUser";
export default function LearnerProfilePage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { learnerId } = useParams();
    const workspace = useAcademicWorkspace();
    const { learners } = workspace;
    const canManageLearners = currentUser.role === "SCHOOL_ADMIN" && currentUser.permissions.includes("users.manage");
    const learner = learners.find((item) => item.id === learnerId);
    if (!learner) {
        return (<section className="teacher-not-found">
        <User size={36}/>

        <h1>Learner not found</h1>

        <p>
          The requested learner record could not be found.
        </p>

        <button type="button" className="primary-button" onClick={() => navigate("/school/learners")}>
          Return to Learners
        </button>
      </section>);
    }
    const learnerSubjects = workspace.subjects.filter((subject) => subject.status === "Active" && subject.programme === learner.programme && subject.classNames.includes(learner.className));
    const activeLearner = learner;
    const returnTo = safeInternalReturnTo(searchParams.get("returnTo"), "/school/learners");
    const returnLabel = returnTo.startsWith("/reports/") ? "Return to Report Preview" : "Back to Learners";
    function updatePhoto(photoUrl) { const { id: _id, ...values } = activeLearner; return workspace.updateLearner(activeLearner.id, { ...values, photoUrl }); }
    return (<>
      <button type="button" className="profile-back-button" onClick={() => navigate(returnTo)}>
        <ArrowLeft size={16}/>
        {returnLabel}
      </button>

      <section className="learner-profile-header">
        <div className="learner-profile-identity">
          <div className="learner-profile-avatar">
            {getLearnerInitials(learner)}
          </div>

          <div>
            <span className="eyebrow">
              LEARNER PROFILE
            </span>

            <h1>{getLearnerFullName(learner)}</h1>

            <p>
              {learner.admissionNumber || "Admission number pending"} •{" "}
              {learner.className} {learner.stream}
            </p>

            <div className="teacher-profile-tags">
              <span className="profile-role-badge">
                {learner.programme}
              </span>

              <span className={`status-badge ${learner.status === "Active"
            ? "status-active"
            : "status-inactive"}`}>
                {learner.status}
              </span>
            </div>
          </div>
        </div>

        {canManageLearners && <div className="session-row-actions"><button type="button" className="secondary-button" onClick={() => navigate(`/school/learners/${learner.id}/edit`)}>
          <Pencil size={16}/>
          Edit Learner
        </button><DeleteRecordButton label={getLearnerFullName(learner)} onDelete={() => workspace.deleteLearner(learner.id)} onDeleted={() => navigate("/school/learners")}/></div>}
      </section>

      {canManageLearners && <MediaAssetEditor title="Learner photo" description="Upload the active learner photograph used on profiles and future report snapshots." value={learner.photoUrl} circular saveLabel="Save photo" onSave={updatePhoto} onRemove={() => updatePhoto("")}/>}

      <div className="learner-profile-grid">
        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <div className="panel-icon">
                <User size={18}/>
              </div>

              <div>
                <h2>Personal Information</h2>
                <p>
                  Learner identity and registration details.
                </p>
              </div>
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>Admission Number</dt>
              <dd>{learner.admissionNumber || "—"}</dd>
            </div>

            <div>
              <dt>Gender</dt>
              <dd>{learner.gender}</dd>
            </div>

            <div>
              <dt>Date of Birth</dt>
              <dd>{learner.dateOfBirth || "—"}</dd>
            </div>

            <div>
              <dt>Admission Date</dt>
              <dd>{learner.admissionDate || "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="panel learner-subject-panel">
          <div className="panel-heading"><div className="panel-title-group"><div className="panel-icon"><BookOpen size={18}/></div><div><h2>Current Subjects</h2><p>Derived from the school offerings for {learner.className}.</p></div></div></div>
          <div className="learner-subject-list">
            {learnerSubjects.map((subject) => <button type="button" key={subject.id} onClick={() => navigate(`/setup/subjects/${subject.id}`)}><span><strong>{subject.name}</strong><small>{subject.department} · {subject.compulsory ? "Compulsory" : "Elective"}</small></span><span className={subject.compulsory ? "status-badge status-active" : "status-badge status-inactive"}>{subject.compulsory ? "Included" : "Enrolment required"}</span></button>)}
            {!learnerSubjects.length && <p className="profile-muted">No school subject offering is connected to this class.</p>}
          </div>
          {learnerSubjects.some((subject) => !subject.compulsory) && <p className="class-muted">Elective subjects are candidates only until an explicit learner-subject enrolment is recorded.</p>}
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <div className="panel-icon">
                <BookOpen size={18}/>
              </div>

              <div>
                <h2>Academic Enrolment</h2>
                <p>
                  Current academic placement.
                </p>
              </div>
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>Programme</dt>
              <dd>{learner.programme}</dd>
            </div>

            <div>
              <dt>Class</dt>
              <dd>{learner.className}</dd>
            </div>

            <div>
              <dt>Stream</dt>
              <dd>{learner.stream}</dd>
            </div>

            <div>
              <dt>Status</dt>
              <dd>{learner.status}</dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <div className="panel-icon">
                <Users size={18}/>
              </div>

              <div>
                <h2>Parent / Guardian</h2>
                <p>
                  Primary guardian contact information.
                </p>
              </div>
            </div>
          </div>

          <dl className="profile-details">
            <div>
              <dt>Guardian</dt>
              <dd>{learner.guardianName}</dd>
            </div>

            <div>
              <dt>Telephone</dt>
              <dd className="profile-muted">
                <Phone size={14}/>
                {learner.guardianPhone}
              </dd>
            </div>
          </dl>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <div className="panel-title-group">
              <div className="panel-icon">
                <ShieldCheck size={18}/>
              </div>

              <div>
                <h2>Academic Context</h2>
                <p>
                  Current reporting context for this learner.
                </p>
              </div>
            </div>
          </div>

          <div className="learner-context-list">
            <div>
              <CalendarDays size={17}/>

              <span>
                <small>Academic Year</small>
                <strong>2026</strong>
              </span>
            </div>

            <div>
              <BookOpen size={17}/>

              <span>
                <small>Current Term</small>
                <strong>Term II</strong>
              </span>
            </div>
          </div>
        </section>
      </div>
    </>);
}
