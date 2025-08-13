
import React, { useRef, useEffect } from 'react';
import { MedicalEpisode, EventStatus } from '../types';

interface EpisodeSelectorProps {
  episodes: MedicalEpisode[];
  onSelectEpisode: (episodeId: string) => void;
  selectedEpisodeId: string | null;
}

const getStatusStyles = (status: EventStatus): { border: string; bg: string; text: string } => {
  switch (status) {
    case EventStatus.ACTIVE:
      return { border: 'border-brand-blue', bg: 'bg-brand-blue/20', text: 'text-brand-blue' };
    case EventStatus.CONFLICT:
      return { border: 'border-brand-yellow', bg: 'bg-brand-yellow/20', text: 'text-brand-yellow' };
    case EventStatus.RESOLVED:
    case EventStatus.COMPLETED:
      return { border: 'border-brand-green', bg: 'bg-brand-green/20', text: 'text-brand-green' };
    case EventStatus.PLANNED:
      return { border: 'border-purple-400', bg: 'bg-purple-500/20', text: 'text-purple-400' };
    default:
      return { border: 'border-gray-500', bg: 'bg-gray-500/20', text: 'text-gray-400' };
  }
};


const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({ episodes, onSelectEpisode, selectedEpisodeId }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (selectedEpisodeId && scrollContainerRef.current) {
      const selectedElement = scrollContainerRef.current.querySelector(`[data-episode-id="${selectedEpisodeId}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [selectedEpisodeId]);

  return (
    <div className="flex-shrink-0 bg-gray-800/50 rounded-lg shadow-lg p-3 ring-1 ring-white/10">
      <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Clinical Episodes</h3>
      <div 
        ref={scrollContainerRef} 
        className="flex space-x-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
      >
        {episodes.map((episode) => {
          const styles = getStatusStyles(episode.status);
          const isSelected = selectedEpisodeId === episode.id;

          return (
            <div
              key={episode.id}
              data-episode-id={episode.id}
              onClick={() => onSelectEpisode(episode.id)}
              className={`
                flex-shrink-0 w-72 bg-slate-800/50 rounded-lg p-4 cursor-pointer
                transition-all duration-300 ease-in-out border-l-4 
                ${styles.border}
                ${isSelected ? 'ring-2 ring-white/80 scale-105 bg-slate-700/50' : 'hover:bg-slate-700/50 hover:shadow-xl'}
              `}
            >
              <div className="flex justify-between items-start mb-2">
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${styles.bg} ${styles.text}`}>
                    {episode.status.toUpperCase()}
                  </span>
                  <span className="text-xs text-gray-400">{episode.dateRange}</span>
              </div>
              <p className="text-sm text-gray-200 mt-2 font-medium">
                {episode.title}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EpisodeSelector;
