import { useEffect, useState } from "react";
import { supabase } from "../../config/supabaseClient";
import { useSchoolContext } from "../context/SchoolContext";

export type CurriculumSubject = {
  systemSubjectId: string;
  code: string;
  name: string;
  requirement: "CORE" | "RELIGION_OPTION" | "ELECTIVE" | "SNE_REPLACEMENT";
  category: string | null;
  offeringId: string | null;
  available: boolean;
  teacherAssigned: boolean;
};

export type OLevelCurriculum = {
  ruleSetId: string;
  classLevel: number;
  requiredCount: number;
  electiveMin: number;
  electiveMax: number;
  subjects: CurriculumSubject[];
};

export function useNcdcCurriculum(academicYearId: string, classLevel: number, termId: string) {
  const context = useSchoolContext();
  const [data, setData] = useState<OLevelCurriculum | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const client = supabase as any;
    if (!client || !context.schoolId || !academicYearId || context.loading) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void client.rpc("get_o_level_curriculum", {
      p_school_id: context.schoolId,
      p_academic_year_id: academicYearId,
      p_class_level: classLevel,
      p_term_id: termId || null,
    }).then((result: { data?: OLevelCurriculum; error?: { message: string } }) => {
      if (cancelled) return;
      if (result.error) {
        setData(null);
        setError(result.error.message.includes("get_o_level_curriculum")
          ? "The NCDC curriculum service has not been deployed to this school database yet. Class creation is safely limited until it is available."
          : result.error.message);
      }
      else setData(result.data ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [academicYearId, classLevel, context.loading, context.schoolId, termId]);

  return { data, loading, error };
}
