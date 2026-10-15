export function summarizeMarkOfferings(offerings) {
    const byClass = new Map();
    const bySubject = new Map();
    let total = 0;
    let recorded = 0;
    let resolved = 0;
    let missing = 0;
    for (const offering of offerings) {
        for (const learner of offering.learners) {
            const components = [
                { status: learner.aoiStatus, mark: learner.aoiMark },
                { status: learner.examStatus, mark: learner.examMark },
            ];
            for (const component of components) {
                total += 1;
                const hasEntry = component.status === "PRESENT" && component.mark !== null;
                const isResolved = component.status !== "MISSING";
                if (hasEntry)
                    recorded += 1;
                if (isResolved)
                    resolved += 1;
                else
                    missing += 1;
                for (const group of [byClass, bySubject]) {
                    const key = group === byClass ? offering.className : offering.subjectName;
                    const previous = group.get(key) ?? { recorded: 0, total: 0, resolved: 0 };
                    group.set(key, {
                        recorded: previous.recorded + Number(hasEntry),
                        total: previous.total + 1,
                        resolved: previous.resolved + Number(isResolved),
                    });
                }
            }
        }
    }
    return {
        total,
        recorded,
        resolved,
        missing,
        completionPercent: total ? Math.round((resolved / total) * 100) : 0,
        classes: [...byClass].map(([name, value]) => ({ name, ...value, progress: value.total ? Math.round((value.resolved / value.total) * 100) : 0 })),
        subjects: [...bySubject].map(([name, value]) => ({ name, ...value, progress: value.total ? Math.round((value.resolved / value.total) * 100) : 0 })),
    };
}
