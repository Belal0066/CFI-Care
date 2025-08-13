
import React, { useMemo } from 'react';
import { Patient, DataConflict } from '../types';
import { ConflictIcon } from './icons';

interface StaticPatientInfoProps {
  patient: Patient;
  onSelectConflict: (conflict: DataConflict) => void;
}

const InfoRow: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{label}</h3>
    <div className="mt-1 text-gray-200">{children}</div>
  </div>
);

const StaticPatientInfo: React.FC<StaticPatientInfoProps> = ({ patient, onSelectConflict }) => {
  const getAge = (dateString: string) => {
    const today = new Date();
    const birthDate = new Date(dateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const allergyConflicts = useMemo(() => 
    patient.conflicts.filter(c => c.field === 'allergies' && c.status === 'unresolved'), 
    [patient.conflicts]
  );

  return (
    <aside className="w-64 lg:w-72 flex-shrink-0 bg-gray-800/70 p-4 lg:p-6 border-r border-white/10 overflow-y-auto">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white">Personal History</h2>
          <p className="text-gray-400">{patient.name} (ID: {patient.id})</p>
        </div>
        <div className="space-y-4">
          <InfoRow label="Age"><p>{getAge(patient.dateOfBirth)} years</p></InfoRow>
          <InfoRow label="DOB"><p>{new Date(patient.dateOfBirth).toLocaleDateString()}</p></InfoRow>
          <InfoRow label="Blood Type"><p>{patient.bloodType}</p></InfoRow>
          <InfoRow label="Marital Status"><p>{patient.maritalStatus}</p></InfoRow>
          <InfoRow label="Occupation"><p>{patient.occupation}</p></InfoRow>
          <InfoRow label="Address"><p className="text-sm whitespace-pre-line">{patient.address}</p></InfoRow>

          <InfoRow label="Social History">
            <ul className="list-disc list-inside">
              {patient.socialHistory.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
          </InfoRow>
          
          <InfoRow label="Allergies">
            <ul className="list-disc list-inside">
              {patient.allergies.map((item, index) => <li key={index}>{item}</li>)}
              {allergyConflicts.map(conflict => (
                <li key={conflict.id} className="text-brand-yellow list-none -ml-5 flex items-center space-x-2">
                  <ConflictIcon className="w-4 h-4 flex-shrink-0" />
                  <span>{conflict.key}</span>
                   <button 
                      onClick={() => onSelectConflict(conflict)} 
                      className="text-xs text-blue-400 hover:underline focus:outline-none"
                      aria-label={`Resolve conflict for ${conflict.key}`}
                    >
                      (Resolve)
                    </button>
                </li>
              ))}
            </ul>
          </InfoRow>
          <InfoRow label="Genetic Conditions"><ul className="list-disc list-inside">{patient.geneticConditions.map((item, index) => <li key={index}>{item}</li>)}</ul></InfoRow>
          <InfoRow label="Chronic Medications"><ul className="list-disc list-inside">{patient.chronicMedications.map((item, index) => <li key={index}>{item}</li>)}</ul></InfoRow>
          <InfoRow label="Active Devices"><ul className="list-disc list-inside">{patient.activeDevices.map((item, index) => <li key={index}>{item}</li>)}</ul></InfoRow>
        </div>
      </div>
    </aside>
  );
};

export default StaticPatientInfo;