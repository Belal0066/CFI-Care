
import React from 'react';
import { EventNodeData, EventStatus, EventType } from '../types';

interface EventDetailModalProps {
  node: EventNodeData;
  onClose: () => void;
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

interface HpiData {
  symptoms: string[];
  signs: string[];
}

const EventDetailModal: React.FC<EventDetailModalProps> = ({ node, onClose }) => {
  let hpiData: HpiData | null = null;
  if (node.type === EventType.HPI) {
    try {
      hpiData = JSON.parse(node.details);
    } catch (e) {
      console.error("Failed to parse HPI data from details", e);
    }
  }

  return (
    <div 
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl m-4 ring-1 ring-white/10"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/10">
          <div className="flex justify-between items-start">
            <h2 className="text-2xl font-bold text-white">{node.summary}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
          </div>
          <div className="flex items-center space-x-4 mt-2 text-sm text-gray-400">
            <span>{node.type}</span>
            <span>&bull;</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(node.status)}`}>{node.status}</span>
             <span>&bull;</span>
            <span>{node.specialty}</span>
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {hpiData ? (
             <div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold text-gray-200 mb-1 text-base">Symptoms (Subjective)</h3>
                  <p className="text-xs text-gray-500 mb-2">What the patient feels or reports.</p>
                  <div className="bg-gray-900/50 p-3 rounded-md space-y-2 text-sm h-full">
                    {hpiData.symptoms && hpiData.symptoms.length > 0 ? (
                      <ul className="list-disc list-inside text-gray-300 space-y-1">
                        {hpiData.symptoms.map((symptom, i) => <li key={i}>{symptom}</li>)}
                      </ul>
                    ) : (
                      <p className="text-gray-500 italic">None reported.</p>
                    )}
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-200 mb-1 text-base">Signs (Objective)</h3>
                  <p className="text-xs text-gray-500 mb-2">What is observed or measured.</p>
                  <div className="bg-gray-900/50 p-3 rounded-md space-y-2 text-sm h-full">
                    {hpiData.signs && hpiData.signs.length > 0 ? (
                      <ul className="list-disc list-inside text-gray-300 space-y-1">
                        {hpiData.signs.map((sign, i) => <li key={i}>{sign}</li>)}
                      </ul>
                    ) : (
                      <p className="text-gray-500 italic">None observed.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h3 className="font-semibold text-gray-300">Details</h3>
              <p className="text-gray-400 bg-gray-900/50 p-3 rounded-md mt-1">{node.details}</p>
            </div>
          )}
          
           <div className="pt-4">
            <h3 className="font-semibold text-gray-300">Metadata</h3>
            <div className="text-gray-400 bg-gray-900/50 p-3 rounded-md mt-1 grid grid-cols-2 gap-2 text-sm">
                <div>Author: <span className="text-gray-200">{node.author}</span></div>
                <div>Timestamp: <span className="text-gray-200">{node.timestamp.toLocaleString()}</span></div>
                <div className="col-span-2">Commit ID: <span className="text-gray-200 font-mono text-xs">{node.id}</span></div>
                <div className="col-span-2">Parent IDs: <span className="text-gray-200 font-mono text-xs">{node.parentIds.join(', ') || 'None'}</span></div>
            </div>
          </div>

          {node.diff && (
             <div>
                <h3 className="font-semibold text-gray-300">Change History</h3>
                <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-red-900/20 p-3 rounded-md">
                        <h4 className="font-semibold text-red-300">Before</h4>
                        <p className="text-gray-400 mt-1 whitespace-pre-wrap font-mono text-sm">{node.diff.before}</p>
                    </div>
                    <div className="bg-green-900/20 p-3 rounded-md">
                        <h4 className="font-semibold text-green-300">After</h4>
                        <p className="text-gray-300 mt-1 whitespace-pre-wrap font-mono text-sm">{node.diff.after}</p>
                    </div>
                </div>
            </div>
          )}
        </div>
        
        <div className="p-4 bg-gray-900/50 border-t border-white/10 text-right">
            <button 
                onClick={onClose}
                className="px-4 py-2 bg-brand-blue hover:bg-brand-blue/80 text-white rounded-md font-semibold"
            >
                Close
            </button>
        </div>
      </div>
    </div>
  );
};

export default EventDetailModal;