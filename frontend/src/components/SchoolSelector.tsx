import React from 'react';
import { useSchoolFilter } from '../stores/schoolFilterStore';

export function SchoolSelector() {
  const { schools, selectedSchoolId, setSelectedSchoolId } = useSchoolFilter();

  return (
    <div className="school-filter-bar">
      <button
        className={`filter-pill ${selectedSchoolId === null ? 'active' : ''}`}
        onClick={() => setSelectedSchoolId(null)}
      >
        <i className="fa-solid fa-globe" style={{ marginLeft: '6px' }} /> جميع المدارس
      </button>
      {schools.filter(school => school.isActive !== false).map((school) => (
        <button
          key={school.id}
          className={`filter-pill ${selectedSchoolId === school.id ? 'active' : ''}`}
          onClick={() => setSelectedSchoolId(school.id)}
        >
          {school.name}
        </button>
      ))}
    </div>
  );
}
