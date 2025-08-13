
import React from 'react';
import { DataConflict } from '../types';
import { ConflictIcon } from './icons';

interface ConflictResolutionModalProps {
  conflict: DataConflict;
  onClose: () => void;
  onResolve: (conflict: DataConflict, resolution: 'confirm' | 'investigate' | 'discard') => void;
}

const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({ conflict, onClose, onResolve }) => {
  return (
    <div 
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-resolution-title"
    >
      <div 
        className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-3xl m-4 ring-1 ring-white/10 flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="p-4 lg:p-6 border-b border-white/10 flex items-center space-x-3">
          <ConflictIcon className="h-6 w-6 text-brand-yellow" />
          <h2 id="conflict-resolution-title" className="text-2xl font-bold text-white">Resolve Data Conflict</h2>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-white text-3xl leading-none">&times;</button>
        </header>

        <div className="p-4 lg:p-6 flex-1 space-y-4">
          <p className="text-gray-300">A conflict was detected for <strong className="font-semibold text-white uppercase">{conflict.field}: {conflict.key}</strong>. Please review the entries and choose an action.</p>
          
          <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-900/50 p-4 rounded-md ring-1 ring-white/10">
                  <h4 className="font-semibold text-gray-300">Existing Record</h4>
                  <p className="text-gray-200 mt-2 whitespace-pre-wrap font-mono text-sm">{conflict.existingValue}</p>
                  <p className="text-xs text-gray-500 mt-3">Source: {conflict.sources.existing}</p>
              </div>
              <div className="bg-brand-yellow/10 p-4 rounded-md ring-1 ring-brand-yellow/50">
                  <h4 className="font-semibold text-brand-yellow">New Entry</h4>
                  <p className="text-yellow-100 mt-2 whitespace-pre-wrap font-mono text-sm">{conflict.newValue}</p>
                  <p className="text-xs text-yellow-500 mt-3">Source: {conflict.sources.new}</p>
              </div>
          </div>
        </div>
        
        <footer className="p-4 bg-gray-900/50 border-t border-white/10 flex justify-end items-center space-x-3">
            <button 
                onClick={() => onResolve(conflict, 'investigate')}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-md font-semibold"
                title="Keep conflict active and close this window for now."
            >
                Mark as 'Investigating'
            </button>
            <button 
                onClick={() => onResolve(conflict, 'discard')}
                className="px-4 py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-md font-semibold"
                title="Discard the new entry and resolve the conflict."
            >
                Discard New Entry
            </button>
            <button 
                onClick={() => onResolve(conflict, 'confirm')}
                className="px-4 py-2 bg-green-600/90 hover:bg-green-600 text-white rounded-md font-semibold"
                title="Accept the new entry, update the patient record, and resolve the conflict."
            >
                Confirm New Entry
            </button>
        </footer>
      </div>
    </div>
  );
};

export default ConflictResolutionModal;
