export const learners = [];
export function getLearnerFullName(learner) {
    return [
        learner.firstName,
        learner.otherName,
        learner.lastName,
    ]
        .filter(Boolean)
        .join(" ");
}
export function getLearnerInitials(learner) {
    return `${learner.firstName.charAt(0)}${learner.lastName.charAt(0)}`.toUpperCase();
}
