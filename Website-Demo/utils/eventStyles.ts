
import React from 'react';
import { EventType } from '../types';
import { 
    DiagnosisIcon, MedicationIcon, ProcedureIcon, InvestigationIcon, HpiIcon, 
    HospitalizationIcon, FollowUpIcon, AdverseEventIcon, SocialHistoryIcon, DefaultIcon,
    ObservationIcon,
} from '../components/icons';

export const eventStyles: Record<string, { color: string; bgColor: string; icon: React.FC<{className?: string}> }> = {
    [EventType.DIAGNOSIS]: { color: 'text-purple-300', bgColor: 'bg-purple-500/20', icon: DiagnosisIcon },
    [EventType.MEDICATION]: { color: 'text-blue-300', bgColor: 'bg-blue-500/20', icon: MedicationIcon },
    [EventType.PROCEDURE]: { color: 'text-green-300', bgColor: 'bg-green-500/20', icon: ProcedureIcon },
    [EventType.INVESTIGATION]: { color: 'text-yellow-300', bgColor: 'bg-yellow-500/20', icon: InvestigationIcon },
    [EventType.HPI]: { color: 'text-red-300', bgColor: 'bg-red-500/20', icon: HpiIcon },
    [EventType.HOSPITALIZATION]: { color: 'text-orange-300', bgColor: 'bg-orange-500/20', icon: HospitalizationIcon },
    [EventType.FOLLOW_UP]: { color: 'text-teal-300', bgColor: 'bg-teal-500/20', icon: FollowUpIcon },
    [EventType.ADVERSE_EVENT]: { color: 'text-red-400', bgColor: 'bg-red-700/30', icon: AdverseEventIcon },
    [EventType.SOCIAL_HISTORY]: { color: 'text-gray-300', bgColor: 'bg-gray-500/20', icon: SocialHistoryIcon },
    [EventType.OBSERVATION]: { color: 'text-cyan-300', bgColor: 'bg-cyan-500/20', icon: ObservationIcon },
};

export const getEventStyle = (type: EventType) => {
    return eventStyles[type] || { color: 'text-gray-300', bgColor: 'bg-gray-600/20', icon: DefaultIcon };
};