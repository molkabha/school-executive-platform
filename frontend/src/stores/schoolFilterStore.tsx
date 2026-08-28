import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { School } from '../types';
import { SchoolsService } from '../services/api';

interface SchoolFilterContextValue {
  schools: School[];
  selectedSchoolId: string | null; // null = All Schools
  setSelectedSchoolId: (id: string | null) => void;
  selectedSchool: School | null;
  isLoading: boolean;
}

const SchoolFilterContext = createContext<SchoolFilterContextValue | undefined>(undefined);

export function SchoolFilterProvider({ children }: { children: ReactNode }) {
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<string | null>(
    () => localStorage.getItem('selected_school_id') || null
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    SchoolsService.getAll()
      .then((data) => {
        setSchools(data);

        // Validate any school ID persisted from a previous session against
        // the schools we actually got back. If it no longer exists or is
        // inactive, fall back to "All Schools" rather than sending requests
        // for a school ID the backend will reject.
        setSelectedSchoolIdState((currentId) => {
          if (!currentId) return currentId;
          const match = (data as School[]).find((s: School) => s.id === currentId);
          const isValid = !!match && match.isActive !== false;
          if (isValid) return currentId;
          localStorage.removeItem('selected_school_id');
          return null;
        });
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const setSelectedSchoolId = (id: string | null) => {
    // Never persist/select a school that doesn't exist or is inactive.
    if (id) {
      const match = schools.find((s) => s.id === id);
      if (schools.length > 0 && (!match || match.isActive === false)) {
        id = null;
      }
    }
    setSelectedSchoolIdState(id);
    if (id) localStorage.setItem('selected_school_id', id);
    else localStorage.removeItem('selected_school_id');
  };

  const selectedSchool = schools.find((s) => s.id === selectedSchoolId) ?? null;

  return (
    <SchoolFilterContext.Provider
      value={{ schools, selectedSchoolId, setSelectedSchoolId, selectedSchool, isLoading }}
    >
      {children}
    </SchoolFilterContext.Provider>
  );
}

export function useSchoolFilter() {
  const ctx = useContext(SchoolFilterContext);
  if (!ctx) throw new Error('useSchoolFilter must be used within SchoolFilterProvider');
  return ctx;
}
