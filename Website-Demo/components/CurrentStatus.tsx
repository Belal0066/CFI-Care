import React, { useState, useMemo } from 'react';
import { Patient, EventNodeData, EventStatus, EventType, VitalSign } from '../types';
import { ChevronDownIcon } from './icons';
import { getEventStyle } from '../utils/eventStyles';
import VitalsGraph from './VitalsGraph';

interface CurrentStatusProps {
  patient: Patient;
  events: EventNodeData[];
  vitals: VitalSign[];
}

const getStatusColor = (status: EventStatus) => {
    switch (status) {
      case EventStatus.ACTIVE:
        return 'bg-blue-500/20 text-blue-400';
      case EventStatus.RESOLVED:
      case EventStatus.COMPLETED:
        return 'bg-green-500/20 text-green-400';
      case EventStatus.PLANNED:
        return 'bg-yellow-500/20 text-yellow-400';
      case EventStatus.CONFLICT:
        return 'bg-brand-yellow/20 text-brand-yellow';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
};

const CollapsibleSection: React.FC<{ title: string; children: React.ReactNode; count: number, defaultOpen?: boolean }> = ({ title, children, count, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (count === 0 && title !== "Vitals") {
    return (
        <div className="bg-gray-800 rounded-lg p-3">
            <p className="text-gray-500">{title} - None</p>
        </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg">
      <button
        className="w-full flex justify-between items-center p-3 text-left font-bold text-white"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>{title} {count > 0 ? `(${count})` : ''}</span>
        <ChevronDownIcon className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="p-3 border-t border-white/10">
          {children}
        </div>
      )}
    </div>
  );
};

const CurrentStatus: React.FC<CurrentStatusProps> = ({ patient, events, vitals }) => {

  const pastMedicalHistory = useMemo(() =>
    events.filter(e =>
      e.type === EventType.DIAGNOSIS || e.type === EventType.HPI
    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
  [events]);

  const pastSurgicalHistory = useMemo(() =>
    events.filter(e =>
      e.type === EventType.PROCEDURE || e.type === EventType.HOSPITALIZATION
    ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()),
  [events]);

  const activeMedications = useMemo(() =>
    events.filter(e => e.type === EventType.MEDICATION && e.status === EventStatus.ACTIVE)
      .sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()),
  [events]);

  const pastHistoryCount = pastMedicalHistory.length + pastSurgicalHistory.length;
  const medicationCount = patient.chronicMedications.length + activeMedications.length;


  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-xl font-bold text-white mb-2">Chronic History</h2>
      
      <CollapsibleSection title="Vitals" count={vitals.length} defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vitals.map(vital => (
                <VitalsGraph key={vital.name} vital={vital} />
            ))}
        </div>
      </CollapsibleSection>
      
      <CollapsibleSection title="Past History" count={pastHistoryCount}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h3 className="font-semibold text-gray-200 mb-2">Medical History</h3>
                {pastMedicalHistory.length > 0 ? (
                    <ul className="space-y-3">
                        {pastMedicalHistory.map(e => (
                           <li key={e.id} className="text-gray-300 flex items-center justify-between space-x-3">
                               <div className="flex items-center space-x-3">
                                    <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${getEventStyle(e.type).bgColor.replace('bg-','').split('/')[0]}`}></span>
                                    <span className="flex-1 text-sm">{e.summary}</span>
                               </div>
                               <div className="flex items-center space-x-2 flex-shrink-0">
                                    <span className="text-xs text-gray-400">{e.timestamp.toLocaleDateString()}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(e.status)}`}>{e.status}</span>
                               </div>
                            </li> 
                        ))}
                    </ul>
                ) : (
                  <p className="text-gray-500 italic text-sm">None recorded.</p>
                )}
            </div>
             <div>
                <h3 className="font-semibold text-gray-200 mb-2">Surgical History</h3>
                {pastSurgicalHistory.length > 0 ? (
                    <ul className="space-y-3">
                        {pastSurgicalHistory.map(e => (
                           <li key={e.id} className="text-gray-300 flex items-center justify-between space-x-3">
                               <div className="flex items-center space-x-3">
                                    <span className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${getEventStyle(e.type).bgColor.replace('bg-','').split('/')[0]}`}></span>
                                    <span className="flex-1 text-sm">{e.summary}</span>
                               </div>
                               <div className="flex items-center space-x-2 flex-shrink-0">
                                    <span className="text-xs text-gray-400">{e.timestamp.toLocaleDateString()}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(e.status)}`}>{e.status}</span>
                               </div>
                            </li> 
                        ))}
                    </ul>
                ) : (
                  <p className="text-gray-500 italic text-sm">None recorded.</p>
                )}
            </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Medication" count={medicationCount}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
                <h3 className="font-semibold text-gray-200 mb-2">Chronic</h3>
                {patient.chronicMedications.length > 0 ? (
                    <ul className="space-y-2">
                        {patient.chronicMedications.map((med, index) => (
                           <li key={index} className="text-gray-300 flex items-start space-x-2 text-sm">
                               <span className="flex-shrink-0 mt-1.5 w-2 h-2 rounded-full bg-yellow-500"></span>
                               <span>{med}</span>
                            </li> 
                        ))}
                    </ul>
                ) : (
                   <p className="text-gray-500 italic text-sm">None recorded.</p>
                )}
            </div>
            <div>
                <h3 className="font-semibold text-gray-200 mb-2">Active</h3>
                {activeMedications.length > 0 ? (
                    <ul className="space-y-2">
                        {activeMedications.map(e => (
                           <li key={e.id} className="text-gray-300 flex items-start space-x-2 text-sm">
                                <span className={`flex-shrink-0 mt-1.5 w-2 h-2 rounded-full ${getEventStyle(e.type).bgColor.replace('bg-','').split('/')[0]}`}></span>
                                <span>{e.summary} - <span className="text-gray-400 text-xs">since {e.timestamp.toLocaleDateString()}</span></span>
                            </li>
                        ))}
                    </ul>
                ) : (
                   <p className="text-gray-500 italic text-sm">None recorded.</p>
                )}
            </div>
        </div>
      </CollapsibleSection>

    </div>
  );
};

export default CurrentStatus;