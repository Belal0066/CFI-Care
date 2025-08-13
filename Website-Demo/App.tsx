import React, { useState, useMemo, useEffect } from 'react';
import { Patient, EventNodeData, DataConflict, EventStatus, MedicalEpisode, EventType, VitalSign, DependencyGraphData } from './types';
import { getPatientData, getEhrHistory, getVitalsData, getDependencyGraphData } from './services/ehrDataService';
import StaticPatientInfo from './components/StaticPatientInfo';
import CurrentStatus from './components/CurrentStatus';
import EpisodeSelector from './components/EpisodeSelector';
import DetailedHistoryGraph from './components/DetailedHistoryGraph';
import EventDetailModal from './components/EventDetailModal';
import ConflictResolutionModal from './components/ConflictResolutionModal';
import DependencyGraph from './components/DependencyGraph';
import { LogoIcon, ConflictIcon } from './components/icons';

type ActiveTab = 'graph' | 'status' | 'research';

const App: React.FC = () => {
  const [patientData, setPatientData] = useState<Patient | null>(null);
  const [medicalEpisodes, setMedicalEpisodes] = useState<MedicalEpisode[]>([]);
  const [vitalsData, setVitalsData] = useState<VitalSign[]>([]);
  const [dependencyGraphData, setDependencyGraphData] = useState<DependencyGraphData | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<EventNodeData | null>(null);
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([]);
  const [selectedEventTypes, setSelectedEventTypes] = useState<EventType[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('graph');
  const [conflictToResolve, setConflictToResolve] = useState<DataConflict | null>(null);

  useEffect(() => {
    setPatientData(getPatientData());
    setVitalsData(getVitalsData());
    setDependencyGraphData(getDependencyGraphData());
    const episodes = getEhrHistory();
    setMedicalEpisodes(episodes);
    if (episodes.length > 0) {
      setSelectedEpisodeId(episodes[0].id);
    }
  }, []);

  const allEventsFromAllEpisodes = useMemo(() => {
    return medicalEpisodes.flatMap(episode => episode.events);
  }, [medicalEpisodes]);

  const allSpecialties = useMemo(() => {
    return [...new Set(allEventsFromAllEpisodes.map(e => e.specialty))].sort();
  }, [allEventsFromAllEpisodes]);

  const allEventTypes = useMemo(() => {
    return Object.values(EventType);
  }, []);
  
  const unresolvedConflictsCount = useMemo(() => {
    return patientData?.conflicts.filter(c => c.status === 'unresolved').length || 0;
  }, [patientData]);

  const filteredEventsForGraph = useMemo(() => {
    const selectedEpisode = medicalEpisodes.find(ep => ep.id === selectedEpisodeId);
    if (!selectedEpisode) return [];

    const baseEvents = selectedEpisode.events;
    const hasSpecialtyFilter = selectedSpecialties.length > 0;
    const hasTypeFilter = selectedEventTypes.length > 0;

    if (!hasSpecialtyFilter && !hasTypeFilter) {
      return baseEvents;
    }

    return baseEvents.filter(event => {
        const specialtyMatch = !hasSpecialtyFilter || selectedSpecialties.includes(event.specialty);
        const typeMatch = !hasTypeFilter || selectedEventTypes.includes(event.type);
        return specialtyMatch && typeMatch;
    });
  }, [medicalEpisodes, selectedEpisodeId, selectedSpecialties, selectedEventTypes]);

  const handleSpecialtyToggle = (specialty: string) => {
    setSelectedSpecialties(prev => 
      prev.includes(specialty) ? prev.filter(s => s !== specialty) : [...prev, specialty]
    );
  };

  const handleEventTypeToggle = (eventType: EventType) => {
    setSelectedEventTypes(prev =>
      prev.includes(eventType) ? prev.filter(t => t !== eventType) : [...prev, eventType]
    );
  };

  const handleNodeClick = (node: EventNodeData) => {
    setSelectedNode(node);
  };
  
  const handleResolveConflict = (conflict: DataConflict, resolution: 'confirm' | 'investigate' | 'discard') => {
    if (!patientData) return;

    const newPatientData = JSON.parse(JSON.stringify(patientData)) as Patient;
    const conflictInState = newPatientData.conflicts.find(c => c.id === conflict.id);
    if (!conflictInState) return;
    
    if (resolution === 'confirm') {
      if (!newPatientData.allergies.includes(conflict.key)) {
        newPatientData.allergies.push(conflict.key);
      }
      conflictInState.status = 'resolved';
    } else if (resolution === 'discard') {
      conflictInState.status = 'resolved';
    }
    
    setPatientData(newPatientData);
    setConflictToResolve(null);
  };

  if (!patientData) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-gray-900 text-white">
            Loading patient data...
        </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-900 text-gray-300 font-sans antialiased">
      <StaticPatientInfo patient={patientData} onSelectConflict={setConflictToResolve} />
      
      <main className="flex flex-col flex-1 p-4 lg:p-6 space-y-4 overflow-hidden">
        <header className="flex-shrink-0">
           <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                 <LogoIcon className="h-8 w-8 text-brand-blue" />
                 <h1 className="text-2xl font-bold text-white">MedFlow</h1>
              </div>
              {unresolvedConflictsCount > 0 && (
                <button onClick={() => setConflictToResolve(patientData.conflicts.find(c => c.status === 'unresolved')!)} className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-brand-yellow/20 text-brand-yellow hover:bg-brand-yellow/30 transition-colors">
                    <ConflictIcon className="h-5 w-5" />
                    <span className="font-semibold">{unresolvedConflictsCount} Unresolved Conflict{unresolvedConflictsCount > 1 ? 's' : ''}</span>
                </button>
              )}
            </div>
          <p className="text-gray-400 mt-1">An interactive view of {patientData.name}'s medical history.</p>
        </header>

        <div className="flex-shrink-0 flex border-b border-gray-700">
            <button onClick={() => setActiveTab('graph')} className={`px-4 py-2 font-semibold text-base transition-colors relative ${activeTab === 'graph' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                History Timeline
                {activeTab === 'graph' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue"></span>}
            </button>
            <button onClick={() => setActiveTab('status')} className={`px-4 py-2 font-semibold text-base transition-colors relative ${activeTab === 'status' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                Chronic History
                {activeTab === 'status' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue"></span>}
            </button>
            <button onClick={() => setActiveTab('research')} className={`px-4 py-2 font-semibold text-base transition-colors relative ${activeTab === 'research' ? 'text-white' : 'text-gray-400 hover:text-white'}`}>
                Research Graph
                {activeTab === 'research' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-blue"></span>}
            </button>
        </div>

        {activeTab === 'graph' && (
          <div className="flex flex-col flex-1 space-y-4 overflow-hidden">
            <div className="flex-shrink-0 flex flex-col space-y-4">
                <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Filter by Specialty</h3>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSelectedSpecialties([])} className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedSpecialties.length === 0 ? 'bg-brand-blue text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>All Specialties</button>
                        {allSpecialties.map(specialty => (
                            <button key={specialty} onClick={() => handleSpecialtyToggle(specialty)} className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedSpecialties.includes(specialty) ? 'bg-brand-blue text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>{specialty}</button>
                        ))}
                    </div>
                </div>
                 <div>
                    <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Filter by Record Type</h3>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSelectedEventTypes([])} className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedEventTypes.length === 0 ? 'bg-brand-purple text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>All Types</button>
                        {allEventTypes.map(type => (
                            <button key={type} onClick={() => handleEventTypeToggle(type)} className={`px-3 py-1 text-sm rounded-full transition-colors ${selectedEventTypes.includes(type) ? 'bg-brand-purple text-white' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}>{type}</button>
                        ))}
                    </div>
                </div>
            </div>

            <EpisodeSelector episodes={medicalEpisodes} onSelectEpisode={setSelectedEpisodeId} selectedEpisodeId={selectedEpisodeId} />
            
            <div className="flex-1 bg-gray-800/50 rounded-lg shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10">
              <div className="flex-1 p-4 overflow-hidden">
                {selectedEpisodeId ? <DetailedHistoryGraph key={selectedEpisodeId + selectedSpecialties.join('-') + selectedEventTypes.join('-')} allEvents={filteredEventsForGraph} onNodeClick={handleNodeClick} /> : <div className="flex items-center justify-center h-full text-gray-500"><p>Select an episode from the timeline above to see detailed history.</p></div>}
              </div>
            </div>
          </div>
        )}
        
        {activeTab === 'status' && (
            <div className="flex-1 bg-gray-800/50 rounded-lg shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10">
                <div className="flex-1 p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                    <CurrentStatus patient={patientData} events={allEventsFromAllEpisodes} vitals={vitalsData} />
                </div>
            </div>
        )}

        {activeTab === 'research' && dependencyGraphData && (
            <div className="flex-1 bg-gray-800/50 rounded-lg shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10">
                <DependencyGraph graphData={dependencyGraphData} />
            </div>
        )}
      </main>
      
      {selectedNode && (
        <EventDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
      {conflictToResolve && (
        <ConflictResolutionModal conflict={conflictToResolve} onClose={() => setConflictToResolve(null)} onResolve={handleResolveConflict} />
      )}
    </div>
  );
};

export default App;
