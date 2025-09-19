/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback, useRef, StrictMode, ReactNode, createContext, useContext, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { generateCase, createChatForCase, PharmacyCase, MCQ, generateHint, CaseTags, GenerationFilters, pickPharmacyAreaForCase, pickBestAvatar, Chat, PharmacyArea, DebriefData, generateDebrief, getElevenLabsAudio } from './services/geminiService';
import { supabase, signIn, signUp, signOut, getUserProfile, updateUserProfile, getNotifications, markNotificationAsRead as supabaseMarkNotificationAsRead, markAllNotificationsAsRead as supabaseMarkAllNotificationsAsRead, Notification, NotificationType, Profile } from './services/supabaseService';
import { Session, User } from '@supabase/supabase-js';


// --- TYPE DEFINITIONS ---
type TrainingPhase = 'B.Pharm Year 1' | 'B.Pharm Year 2' | 'B.Pharm Year 3' | 'B.Pharm Year 4';
type CognitiveSkill = 'Recall' | 'Application' | 'Analysis';
type EPA = 'History-taking' | 'Patient Counseling' | 'Intervention' | 'Documentation';
type Page = 'home' | 'simulation' | 'callback' | 'debrief';
type Theme = 'light' | 'dark';
type SimulationTab = 'chat' | 'problem' | 'labs' | 'case' | 'exam' | 'meds';
type HomeTab = 'home' | 'case' | 'profile';


export interface ChatMessage {
    sender: 'user' | 'patient' | 'system';
    text: string;
    timestamp: string;
}

// --- NEW DATA STRUCTURE TYPES ---
interface DiseaseCluster {
  name: string;
  description: string;
}

interface PharmacySubSpecialty {
  name: string;
  apiValue: string;
  clusters: DiseaseCluster[];
}

interface PharmacyDiscipline {
  name: string;
  icon: React.FC;
  subSpecialties: PharmacySubSpecialty[];
}


// --- CONSTANTS & SEED DATA ---
const ALL_TRAINING_PHASES: TrainingPhase[] = ['B.Pharm Year 1', 'B.Pharm Year 2', 'B.Pharm Year 3', 'B.Pharm Year 4'];
const ALL_EPAS: EPA[] = ['History-taking', 'Patient Counseling', 'Intervention', 'Documentation'];
const MAX_HINTS = 10;
const HINT_STORAGE_KEY = 'medanna_hintUsage_v2';

const ALL_INVESTIGATIONS: Record<string, string[]> = {
    'Bedside Tests': ['ECG', 'Blood Glucose', 'Urine Dipstick'],
    'Basic Labs': ['CBC', 'CMP', 'ESR', 'CRP', 'TSH', 'Lipid Profile', 'LFT', 'RFT', 'ABG'],
    'Advanced Labs': ['Troponin', 'BNP', 'D-dimer', 'Coagulation Profile', 'Blood Culture', 'HbA1c'],
    'Imaging': ['Chest X-Ray', 'CT Head', 'CT Chest', 'CT Abdomen', 'Abdominal Ultrasound', 'Echocardiogram'],
};

const MEDICAL_FUN_FACTS: Record<PharmacyArea | 'General', string[]> = {
    'General': [
        'The first drug to be mass-produced was Penicillin.',
        'Aspirin, one of the most common drugs, was originally derived from willow tree bark.',
        'The symbol "Rx" for prescriptions is thought to be an abbreviation for the Latin word "recipere," which means "to take."',
        'Ancient Egyptians had a grasp of pharmacy, with documents like the Ebers Papyrus listing over 700 remedies.',
        'The world\'s first pharmacy was established in Baghdad in the 8th century.',
    ],
    'Community Pharmacy': [
        'More than 90% of people live within 5 miles of a community pharmacy.',
        'Community pharmacists dispense billions of prescriptions each year worldwide.',
        'Many community pharmacies are now offering services like vaccinations and health screenings.'
    ],
    'Hospital Pharmacy': [
        'Hospital pharmacists are responsible for sterile compounding of intravenous medications.',
        'They often participate in "rounds" with physicians to optimize patient medication therapy.',
        'Clinical pharmacists in hospitals play a key role in preventing medication errors.'
    ],
    'Clinical Pharmacy': [
        'The field of clinical pharmacy began to grow rapidly in the 1960s, shifting focus from dispensing to patient care.',
        'Clinical pharmacists work directly with medical teams to ensure the most effective treatments.',
    ],
    'Industrial Pharmacy': [
        'The process of developing a new drug, from discovery to market, can take over 10 years and cost billions of dollars.',
        'Pharmacovigilance is a key role in industrial pharmacy, focused on monitoring the safety of drugs once they are on the market.',
    ],
};

// --- SVG ICONS ---
const IconBook = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>;
const IconStethoscope = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M8 4h1a2 2 0 0 1 2 2v2a4 4 0 0 1-4 4H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-1"/><path d="M17 4a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/></svg>;
const IconGraduationCap = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 6 0 0 0 12 0v-3.5"/></svg>;
const IconBriefcase = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>;
const IconMenu = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;
const IconClose = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconAlertTriangle = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>;
const IconCheck = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>;
const IconX = ({className}: {className?: string}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;
const IconChevronDown = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;
const IconChevronUp = ({ className }: { className?: string }) => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>;
const IconHome = ({className, isActive}: {className?: string, isActive?: boolean}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IconSun = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
const IconMoon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>;
const IconSend = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>;
const IconPatient = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"/><path d="M19 22v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/></svg>;
const IconLightbulb = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>;
const IconUser = ({className, isActive}: {className?: string, isActive?: boolean}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconDashboard = ({className, isActive}: {className?: string, isActive?: boolean}) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>;
const IconLogOut = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IconFileText = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>;
const IconBell = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>;
const IconAward = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 17 17 23 15.79 13.88"/></svg>;
const IconMail = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>;
const IconChevronLeft = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>;
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l-.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0 2l.15.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
const IconGift = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>;
const IconArrowRight = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>;
const IconHeart = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const IconBrain = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v1.23a.5.5 0 0 0 .3.46l4.43 2.22a2.5 2.5 0 0 1 1.47 3.32l-1.04 2.56a2.5 2.5 0 0 1-3.32 1.47l-4.43-2.22a.5.5 0 0 0-.3-.46V9.5A2.5 2.5 0 0 1 7 7 2.5 2.5 0 0 1 9.5 4.5 2.5 2.5 0 0 1 12 7v3.5"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v1.23a.5.5 0 0 1-.3.46l-4.43 2.22a2.5 2.5 0 0 0-1.47 3.32l1.04 2.56a2.5 2.5 0 0 0 3.32 1.47l4.43-2.22a.5.5 0 0 1 .3-.46V9.5A2.5 2.5 0 0 0 17 7a2.5 2.5 0 0 0-2.5-2.5Z"/><path d="M6 16a1 1 0 0 1-1-1v-2.5a.5.5 0 0 1 .5-.5.5.5 0 0 0 .5-.5V10a1 1 0 0 1 1-1h1"/><path d="M18 16a1 1 0 0 0 1-1v-2.5a.5.5 0 0 0-.5-.5.5.5 0 0 1-.5-.5V10a1 1 0 0 0-1-1h-1"/></svg>;
const IconScalpel = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.19 21.19 2.81 2.81"/><path d="M18.37 3.63 8 14l-4.37.75c-2.3.4-3.56 3.1-2.12 4.54l.15.15c1.44 1.44 4.14.18 4.54-2.12L7 16l10.37-10.37Z"/></svg>;
const IconActivity = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const IconBaby = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12.5a5 5 0 0 0 5 5"/><path d="M9 8.5a5 5 0 0 1 5 5"/><path d="M11.5 2a.5.5 0 0 0-1 0V3a.5.5 0 0 0 1 0Z"/><path d="M18 12.5a5 5 0 0 0 5-5A5 5 0 0 0 14 6c-1.5 0-2.8 1-3.5 2.5"/><path d="M6 12.5a5 5 0 0 1-5-5A5 5 0 0 1 10 6c1.5 0 2.8 1 3.5 2.5"/><path d="M3 20.5a.5.5 0 0 0 1 0V19a.5.5 0 0 0-1 0Z"/><path d="M21 20.5a.5.5 0 0 1-1 0V19a.5.5 0 0 1 1 0Z"/><path d="M12 22a.5.5 0 0 0 0-1h-2a.5.5 0 0 0 0 1Z"/><circle cx="12" cy="12" r="10"/></svg>;
const IconBottle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5h4"/><path d="M8 2h8"/><path d="M7 5v11a5 5 0 0 0 10 0V5"/><path d="M12 12H7"/><path d="M12 17h5"/></svg>;
const IconSparkles = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.5 3L7 7.5l3 1.5L11.5 12l1.5-3L16 7.5l-3-1.5z"/><path d="M5 13l-1.5 3L0 17.5l3 1.5L4.5 22l1.5-3L9 17.5l-3-1.5z"/><path d="M19 13l-1.5 3L14 17.5l3 1.5L18.5 22l1.5-3L23 17.5l-3-1.5z"/></svg>;
const IconHandPlaster = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M16 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M12 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M16 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M18 8a2 2 0 1 0-4 0v1a2 2 0 1 0 4 0V8Z"/><path d="M18 5a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V5Z"/><path d="M18.8 3.2a1 1 0 0 0-1.6 1.2 5 5 0 0 1-1.2 3.6 5 5 0 0 0-3.6 1.2 1 1 0 0 0 1.2 1.6 7 7 0 0 0 5.2-1.7 7 7 0 0 1 1.7-5.2 1 1 0 0 0-1.7-1.2Z"/><path d="M7 19.5c.2.2.5.2.7 0l2.9-2.9c.2-.2.2-.5 0-.7l-1.2-1.2c-.2-.2-.5-.2-.7 0l-2.9 2.9c-.2.2-.2.5 0 .7l1.2 1.2Z"/><path d="M4.6 20a2.5 2.5 0 0 1-3.4-3.4l.6-.6a2.5 2.5 0 0 1 3.4 3.4l-.6.6Z"/><path d="M11 11.5c.2.2.5.2.7 0l2.9-2.9c.2-.2.2-.5 0-.7l-1.2-1.2c-.2-.2-.5-.2-.7 0L10 9.6c-.2.2-.2.5 0 .7l1.2 1.2Z"/></svg>;
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
const IconUsers = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconMessageCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>;
const IconHelpCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>;
const IconCheckCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
const IconXCircle = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>;
const IconFire = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>;
const IconDownload = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>;
const IconFlaskConical = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v7.31"/><path d="M14 9.31V2"/><path d="M4 14s1 1.33 1 2c0 .7-.33 1-1 1H2s-.67 0-1-1c0-.67.33-1 1-2s1-1.33 1-2c0-.67-.33-1-1-1H1"/><path d="m7 21 1-1 1 1-1 1-1-1Z"/><path d="m15 21 1-1 1 1-1 1-1-1Z"/><path d="M10.15 11.26c.43.43.81.93 1.12 1.45.31.52.53 1.12.63 1.79.1.67-.02 1.4-.33 2.02-.31.62-.83 1.1-1.46 1.46-.63.36-1.37.52-2.11.48-1.48-.08-2.76-.9-3.5-2.17a4.95 4.95 0 0 1-1.5-3.59c0-1.8 1.01-3.4 2.5-4.25a4.8 4.8 0 0 1 4.75 2.85Z"/></svg>;
const IconClipboardList = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>;
const IconDice = ({ className }: { className?: string }) => <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M8.5 8.5h.01"/><path d="M15.5 8.5h.01"/><path d="M12 12h.01"/><path d="M8.5 15.5h.01"/><path d="M15.5 15.5h.01"/></svg>;

// --- PATIENT AVATAR ICONS ---
const IconAvatarAdultMale = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="4"/><circle cx="50" cy="42" r="16" stroke="currentColor" strokeWidth="4"/><path d="M25 90 C 25 70, 75 70, 75 90" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>;
const IconAvatarAdultFemale = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="4"/><circle cx="50" cy="42" r="16" stroke="currentColor" strokeWidth="4"/><path d="M25 85 C 25 70, 40 65, 50 65 C 60 65, 75 70, 75 85 L 70 95 L 30 95 L 25 85 Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const IconAvatarChildMale = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="4"/><circle cx="50" cy="45" r="14" stroke="currentColor" strokeWidth="4"/><path d="M30 88 C 30 72, 70 72, 70 88" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M40 38 Q 45 32, 50 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M50 38 Q 55 32, 60 38" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
const IconAvatarChildFemale = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="4"/><circle cx="50" cy="45" r="14" stroke="currentColor" strokeWidth="4"/><path d="M30 85 C 30 72, 70 72, 70 85" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M32 35 L 30 25 L 38 28 Z" fill="currentColor"/><path d="M68 35 L 70 25 L 62 28 Z" fill="currentColor"/></svg>;
const IconAvatarElderlyMale = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="4"/><circle cx="50" cy="42" r="16" stroke="currentColor" strokeWidth="4"/><path d="M25 90 C 25 70, 75 70, 75 90" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M38 35 L 35 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M62 35 L 65 28" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M40 52 C 45 55, 55 55, 60 52" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
const IconAvatarElderlyFemale = ({ className }: { className?: string }) => <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="48" stroke="currentColor" strokeWidth="4"/><circle cx="38" cy="38" r="4" fill="currentColor"/><circle cx="62" cy="38" r="4" fill="currentColor"/><path d="M35 30 A 15 15 0 0 1 65 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M25 85 C 25 70, 40 65, 50 65 C 60 65, 75 70, 75 85 L 70 95 L 30 95 L 25 85 Z" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg>;


const PHARMACY_DISCIPLINES: PharmacyDiscipline[] = [
    {
        name: 'Community Pharmacy', icon: IconHome, subSpecialties: [
            {
                name: 'Patient Counseling', apiValue: 'Patient Counseling', clusters: [
                    { name: 'New Prescription Counseling', description: 'Explaining new medications, side effects, and administration.' },
                    { name: 'OTC Recommendations', description: 'Advising on non-prescription remedies for minor ailments.' },
                    { name: 'Device Training', description: 'Teaching patients how to use inhalers, insulin pens, etc.' },
                ]
            },
            {
                name: 'Medication Management', apiValue: 'Medication Management', clusters: [
                    { name: 'Medication Adherence', description: 'Addressing reasons for non-adherence and providing solutions.' },
                    { name: 'Managing Polypharmacy', description: 'Reviewing multiple medications for elderly patients.' },
                    { name: 'Drug Information Questions', description: 'Answering specific patient queries about their meds.' },
                ]
            }
        ]
    },
    {
        name: 'Hospital Pharmacy', icon: IconBriefcase, subSpecialties: [
            {
                name: 'In-Patient Services', apiValue: 'In-Patient Services', clusters: [
                    { name: 'Prescription Verification', description: 'Checking inpatient orders for accuracy and appropriateness.' },
                    { name: 'IV Admixture & Sterile Compounding', description: 'Scenarios related to preparing intravenous drugs.' },
                    { name: 'Medication Reconciliation', description: 'Comparing admission medication lists with current orders.' },
                ]
            },
            {
                name: 'Discharge Counseling', apiValue: 'Discharge Counseling', clusters: [
                    { name: 'Post-Discharge Medication Plan', description: 'Educating patients on their take-home medications.' },
                    { name: 'Preventing Readmissions', description: 'Ensuring patient understanding to avoid hospital return.' },
                ]
            }
        ]
    },
    {
        name: 'Clinical Pharmacy', icon: IconStethoscope, subSpecialties: [
            {
                name: 'Therapeutic Case Management', apiValue: 'Therapeutic Case Management', clusters: [
                    { name: 'Medication Therapy Management (MTM)', description: 'Comprehensive review of a patient\'s medications.' },
                    { name: 'Adverse Drug Reaction (ADR) Identification', description: 'Recognizing and managing side effects.' },
                    { name: 'Drug-Drug Interaction Screening', description: 'Identifying and resolving potential interactions.' },
                ]
            },
            {
                name: 'Special Populations', apiValue: 'Special Populations', clusters: [
                    { name: 'Pediatric Dosing', description: 'Calculating and verifying doses for children.' },
                    { name: 'Geriatric Pharmacology', description: 'Addressing medication challenges in the elderly.' },
                    { name: 'Renal/Hepatic Impairment', description: 'Adjusting drug doses based on organ function.' },
                ]
            }
        ]
    },
    {
        name: 'Industrial Pharmacy', icon: IconFlaskConical, subSpecialties: [
            {
                name: 'Pharmacovigilance', apiValue: 'Pharmacovigilance', clusters: [
                    { name: 'ADR Reporting & Analysis', description: 'Processing and evaluating adverse event reports.' },
                ]
            },
            {
                name: 'Medical Information', apiValue: 'Medical Information', clusters: [
                    { name: 'Responding to Healthcare Professional Queries', description: 'Providing drug information as a pharma company rep.' },
                ]
            }
        ]
    }
];

interface SimulationResult {
    problemCorrect: boolean;
    timeTaken: number; // in seconds
    selectedProblem: string;
}

// --- REACT CONTEXT ---
interface AppContextType {
    // Auth & Profile
    session: Session | null;
    profile: Profile | null;
    isAuthLoading: boolean;
    authError: string | null;
    setProfile: (profile: Profile | null) => void;
    handleSignOut: () => void;
    updateUserTrainingPhase: (trainingPhase: TrainingPhase) => Promise<void>;

    // App State
    page: Page;
    setPage: (page: Page) => void;
    homeTab: HomeTab;
    setHomeTab: (tab: HomeTab) => void;
    theme: Theme;
    toggleTheme: () => void;
    isMobile: boolean;
    isMobileMenuOpen: boolean;
    setIsMobileMenuOpen: (isOpen: boolean) => void;
    
    // Case Generation
    isGenerating: boolean;
    generationError: string | null;
    generationFilters: GenerationFilters | null;
    currentCase: PharmacyCase | null;
    handleStartNewCase: (caseData: PharmacyCase) => void;
    handleGenerateAndStart: (filters: GenerationFilters) => Promise<void>;
    handleRegenerateCase: () => Promise<void>;
    
    // Simulation Result
    simulationResult: SimulationResult | null;
    setSimulationResult: (result: SimulationResult | null) => void;

    // Debrief State
    debriefData: DebriefData | null;
    isGeneratingDebrief: boolean;
    debriefError: string | null;
    handleGenerateDebrief: () => Promise<void>;
    
    // Hint
    hintCount: number;
    getHintCount: () => number;
    updateHintCount: (newCount: number) => void;

    // Patient Avatar
    patientAvatar: { avatarIdentifier: string | null; gender: 'Male' | 'Female' | null; };

    // Notifications
    notifications: Notification[];
    unreadCount: number;
    markNotificationAsRead: (notificationId: number) => Promise<void>;
    markAllNotificationsAsRead: () => Promise<void>;
}

const AppContext = createContext<AppContextType | null>(null);

const useAppContext = (): AppContextType => {
    const context = useContext(AppContext);
    if (!context) throw new Error("useAppContext must be used within an AppContextProvider");
    return context;
};

// --- HELPER FUNCTIONS ---
const timeAgo = (isoDate: string): string => {
    const date = new Date(isoDate);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return `${Math.floor(interval)} years ago`;
    interval = seconds / 2592000;
    if (interval > 1) return `${Math.floor(interval)} months ago`;
    interval = seconds / 86400;
    if (interval > 1) return `${Math.floor(interval)} days ago`;
    interval = seconds / 3600;
    if (interval > 1) return `${Math.floor(interval)} hours ago`;
    interval = seconds / 60;
    if (interval > 1) return `${Math.floor(interval)} minutes ago`;
    return `${Math.floor(seconds)} seconds ago`;
};

const getInitials = (name: string | null | undefined) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
}


const AppContextProvider = ({ children }: { children: ReactNode }) => {
    // Auth & Profile State
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);
    const [authError, setAuthError] = useState<string | null>(null);

    // App State
    const [page, setPage] = useState<Page>('home');
    const [homeTab, setHomeTab] = useState<HomeTab>('home');
    const [theme, setTheme] = useState<Theme>('light');
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 800);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    
    // Case Generation State
    const [isGenerating, setIsGenerating] = useState(false);
    const [generationError, setGenerationError] = useState<string | null>(null);
    const [generationFilters, setGenerationFilters] = useState<GenerationFilters | null>(null);
    const [currentCase, setCurrentCase] = useState<PharmacyCase | null>(null);
    
    // Simulation Result State
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

    // Debrief State
    const [debriefData, setDebriefData] = useState<DebriefData | null>(null);
    const [isGeneratingDebrief, setIsGeneratingDebrief] = useState(false);
    const [debriefError, setDebriefError] = useState<string | null>(null);

    
    // Hint State
    const [hintCount, setHintCount] = useState(MAX_HINTS);

    // Avatar State
    const [patientAvatar, setPatientAvatar] = useState<{ avatarIdentifier: string | null; gender: 'Male' | 'Female' | null }>({ avatarIdentifier: null, gender: null });


    // Notification State
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };
    
    const getHintCount = useCallback(() => {
        try {
            const savedHintUsage = localStorage.getItem(HINT_STORAGE_KEY);
            const today = new Date().toISOString().split('T')[0];
            if (savedHintUsage) {
                const { count, date } = JSON.parse(savedHintUsage);
                if (date === today) return count;
            }
        } catch (error) { console.error("Failed to get hint count", error); }
        return MAX_HINTS;
    }, []);

    // Check for auth callback path on initial load
    useEffect(() => {
        const path = window.location.pathname;
        if (path === '/callback' || path === '/auth/callback') {
            setPage('callback');
        }
    }, []); // Run only once on mount

    const fetchAllUserData = async (user: User) => {
        try {
            const userId = user.id;
            const [profileData, notificationsData] = await Promise.all([
                getUserProfile(userId),
                getNotifications(userId),
            ]);

            if (profileData) {
                const fullProfile: Profile = {
                    ...profileData,
                    training_phase: user.user_metadata.training_phase || null,
                };
                setProfile(fullProfile);
            } else {
                setProfile(null);
            }
            
            setNotifications(notificationsData);
            setUnreadCount(notificationsData.filter(n => !n.is_read).length);
        } catch (error) {
            console.error("Failed to fetch user data", error);
            setAuthError("Could not load your profile data.");
        }
    };

    useEffect(() => {
        // Mobile detection & vh fix
        const handleResize = () => {
            setIsMobile(window.innerWidth <= 800);
            document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
        };
        window.addEventListener('resize', handleResize);
        handleResize(); // Initial call to set values

        // Handle Auth
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            
            // For user metadata updates, update profile silently without a full-page loader or refetching all data.
            if (event === 'USER_UPDATED' && session?.user) {
                setProfile(prevProfile => {
                    if (!prevProfile) return null; // Avoid race conditions on initial sign-in.
                    return {
                        ...prevProfile,
                        training_phase: session.user.user_metadata.training_phase || null
                    };
                });
                return; // Don't affect loading state or fetch all data again.
            }

            // For major auth events (sign-in, sign-out, initial session), update all data.
            if (session?.user) {
                // Fetch user data in the background without awaiting. This prevents UI blocking.
                fetchAllUserData(session.user);
            } else {
                // If there's no session, clear all user-related data.
                setProfile(null);
                setNotifications([]);
                setUnreadCount(0);
            }
            
            // Once we have determined the auth state, we can hide the anitial loader.
            // Data will continue to populate in the background.
            setIsAuthLoading(false);
        });

        // Load Theme & Hint Count
        const savedTheme = localStorage.getItem('theme') as Theme;
        if (savedTheme) setTheme(savedTheme);
        setHintCount(getHintCount());

        return () => {
            authListener.subscription.unsubscribe();
            window.removeEventListener('resize', handleResize);
        }
    }, [getHintCount]);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const handleSignOut = async () => {
        await signOut();
        setPage('home'); // Redirect to home which will render AuthPage
    };

    const [isUpdating, setIsUpdating] = useState(false);
    const updateUserTrainingPhase = async (trainingPhase: TrainingPhase) => {
        if (!profile || !session?.user || isUpdating) return;
        setIsUpdating(true);
        try {
            const { error } = await supabase.auth.updateUser({
                data: { training_phase: trainingPhase }
            });
            if (error) throw error;
            // The onAuthStateChange listener will now handle the profile update seamlessly.
        } catch(error: any) {
            console.error("Failed to update training phase", error.message);
            // Optionally set an error state to show in UI
        } finally {
            setIsUpdating(false);
        }
    };

    const markNotificationAsRead = async (notificationId: number) => {
        if (!session?.user) return;
        // Optimistically update UI
        const originalNotifications = notifications;
        const originalCount = unreadCount;
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));

        const success = await supabaseMarkNotificationAsRead(notificationId, session.user.id);
        if (!success) {
            // Revert on failure
            setNotifications(originalNotifications);
            setUnreadCount(originalCount);
        }
    };
    
    const markAllNotificationsAsRead = async () => {
        if (!session?.user || unreadCount === 0) return;
        // Optimistically update UI
        const originalNotifications = notifications;
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);

        const success = await supabaseMarkAllNotificationsAsRead(session.user.id);
        if (!success) {
            // Revert on failure
            setNotifications(originalNotifications);
            setUnreadCount(originalNotifications.filter(n => !n.is_read).length);
        }
    };

    const loadPatientAvatar = async (profile: PharmacyCase['patientProfile']) => {
        try {
            const avatarData = await pickBestAvatar(profile);
            setPatientAvatar(avatarData);
        } catch (error) {
            console.error("Error during avatar selection process, will fallback to icon.", error);
            setPatientAvatar({ avatarIdentifier: null, gender: null });
        }
    };

    const handleStartNewCase = useCallback((caseData: PharmacyCase) => {
        if (!caseData?.title) {
            console.error("handleStartNewCase was called with invalid data.");
            return;
        }
        setCurrentCase(caseData);
        setDebriefData(null);
        setSimulationResult(null);
        setHintCount(getHintCount()); // Reset hint count for new case from storage
        setPage('simulation');
    }, [getHintCount]);
    
    const handleGenerateAndStart = async (filters: GenerationFilters) => {
        setGenerationFilters(filters);
        setIsGenerating(true);
        setGenerationError(null);
        try {
            let filtersForGeneration = { ...filters };

            if (!filtersForGeneration.specialties || filtersForGeneration.specialties.length === 0) {
                const pickedSpecialty = await pickPharmacyAreaForCase(filters.trainingPhase);
                filtersForGeneration.specialties = [pickedSpecialty];
                setGenerationFilters(filtersForGeneration);
            }
            
            const newCase = await generateCase(filtersForGeneration);
            await loadPatientAvatar(newCase.patientProfile);
            handleStartNewCase(newCase);
        } catch (error) {
            console.error("Case generation failed:", error);
            setGenerationError(`Failed to prepare the simulation. ${error instanceof Error ? error.message : "An unknown error occurred."}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRegenerateCase = async () => {
        if (currentCase?.tags) {
            await handleGenerateAndStart({
                trainingPhase: currentCase.tags.trainingPhase,
                specialties: [currentCase.tags.specialty],
            });
        }
    };
    
    const handleGenerateDebrief = async () => {
        if (!currentCase || !simulationResult) return;
        setIsGeneratingDebrief(true);
        setDebriefError(null);
        try {
            const result = await generateDebrief(currentCase, simulationResult.selectedProblem);
            setDebriefData(result);
        } catch (error) {
            console.error("Debrief generation failed:", error);
            setDebriefError(`Failed to generate debrief. ${error instanceof Error ? error.message : "An unknown error occurred."}`);
        } finally {
            setIsGeneratingDebrief(false);
        }
    };
    
    const updateHintCount = (newCount: number) => {
        setHintCount(newCount);
        const today = new Date().toISOString().split('T')[0];
        localStorage.setItem(HINT_STORAGE_KEY, JSON.stringify({ count: newCount, date: today }));
    };

    const value = {
        session, profile, isAuthLoading, authError, setProfile, handleSignOut, updateUserTrainingPhase,
        page, setPage, homeTab, setHomeTab, theme, toggleTheme, isMobile, isMobileMenuOpen, setIsMobileMenuOpen,
        isGenerating, generationError, generationFilters, currentCase, handleStartNewCase, handleGenerateAndStart, handleRegenerateCase,
        simulationResult, setSimulationResult,
        debriefData, isGeneratingDebrief, debriefError, handleGenerateDebrief,
        hintCount, getHintCount, updateHintCount,
        patientAvatar,
        notifications, unreadCount, markNotificationAsRead, markAllNotificationsAsRead
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- UI COMPONENTS ---

const NotificationIcon = ({ type }: { type: NotificationType }) => {
    switch (type) {
        case 'achievement': return <IconAward />;
        case 'new_feature': return <IconLightbulb />;
        default: return <IconMail />;
    }
};

const NotificationMenu = () => {
    const { 
        notifications, unreadCount, markNotificationAsRead, markAllNotificationsAsRead, 
        setPage, setHomeTab 
    } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.is_read) {
            markNotificationAsRead(notification.id);
        }
        
        if (notification.link) {
            if (notification.link.startsWith('#')) {
                const tab = notification.link.substring(1) as HomeTab;
                setPage('home');
                setHomeTab(tab);
                setIsOpen(false);
            } else {
                window.open(notification.link, '_blank');
            }
        }
    };
    
    return (
        <div className="notification-menu" ref={menuRef}>
            <button className="icon-button notification-bell-button" onClick={() => setIsOpen(!isOpen)} onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)} aria-haspopup="true" aria-expanded={isOpen} aria-label={`${unreadCount} unread notifications`}>
                <IconBell />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
            </button>
            <div className={`notification-dropdown ${isOpen ? 'open' : ''}`} role="menu">
                <div className="dropdown-header">
                    <h4>Notifications</h4>
                    {unreadCount > 0 && <button className="mark-all-read" onClick={markAllNotificationsAsRead}>Mark all as read</button>}
                </div>
                <div className="notification-list">
                    {notifications.length > 0 ? (
                        notifications.map(n => (
                            <div key={n.id} className={`notification-item ${!n.is_read ? 'unread' : ''}`} onClick={() => handleNotificationClick(n)} role="menuitem" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && handleNotificationClick(n)}>
                                <div className="notification-item-icon">
                                    <NotificationIcon type={n.type} />
                                </div>
                                <div className="notification-item-content">
                                    <strong>{n.title}</strong>
                                    <p>{n.message}</p>
                                    <span>{timeAgo(n.created_at)}</span>
                                </div>
                                {!n.is_read && <div className="unread-dot"></div>}
                            </div>
                        ))
                    ) : (
                        <div className="notification-empty">You have no new notifications.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

const ProfileMenu = () => {
    const { profile, theme, toggleTheme, handleSignOut } = useAppContext();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    if (!profile) return null;

    return (
        <div className="profile-menu" ref={menuRef}>
            <button className="profile-avatar" onClick={() => setIsOpen(!isOpen)} onKeyDown={(e) => e.key === 'Enter' && setIsOpen(!isOpen)} aria-haspopup="true" aria-expanded={isOpen}>
                {getInitials(profile.full_name)}
            </button>
            <div className={`profile-dropdown ${isOpen ? 'open' : ''}`} role="menu">
                <div className="dropdown-header">
                    <h4>{profile.full_name || 'User'}</h4>
                    <p>{profile.email}</p>
                </div>
                <button role="menuitem" className="dropdown-item theme-toggle-item" onClick={toggleTheme}>
                    <div className="theme-switch">
                        {theme === 'light' ? <IconMoon /> : <IconSun />}
                        <span>Theme</span>
                    </div>
                    <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
                </button>
                <button role="menuitem" className="dropdown-item" onClick={handleSignOut}>
                    <IconLogOut/>
                    <span>Sign Out</span>
                </button>
            </div>
        </div>
    )
}

const MobileProfileMenu = ({ onClose }: { onClose: () => void }) => {
    const { profile, theme, toggleTheme, handleSignOut, setHomeTab } = useAppContext();

    if (!profile) return null;

    return (
        <div className="mobile-menu-overlay" onClick={onClose}>
            <div className="mobile-menu-content" onClick={(e) => e.stopPropagation()}>
                <div className="mobile-menu-header">
                    <h3>{profile.full_name || 'User'}</h3>
                    <p>{profile.email}</p>
                    <button className="close-button" onClick={onClose} aria-label="Close menu"><IconClose /></button>
                </div>
                <div className="mobile-menu-body">
                     <div className="mobile-menu-section">
                        <button className="mobile-menu-item" onClick={() => { toggleTheme(); onClose(); }}>
                            {theme === 'light' ? <IconMoon /> : <IconSun />}
                            <span>Switch to {theme === 'light' ? 'Dark' : 'Light'} Theme</span>
                        </button>
                        <button className="mobile-menu-item" onClick={() => { handleSignOut(); onClose(); }}>
                            <IconLogOut />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AppHeader = () => {
    const { session, setPage, isMobile, page, homeTab, setIsMobileMenuOpen, profile } = useAppContext();
    
    if (page === 'simulation' && isMobile) {
        return null; // The new fullscreen mobile simulation view has its own UI
    }

    if (isMobile && page === 'home' && (homeTab === 'case')) {
        return null;
    }

    if (isMobile && page === 'home') {
        if (homeTab === 'home') {
            return (
                <header className="app-header mobile-home-header">
                    <button className="icon-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                        <IconMenu />
                    </button>
                    <div className="welcome-message">
                        <h2>Hi, {profile?.full_name?.split(' ')[0] || 'User'}</h2>
                        <p>Your patients are lined up, let's get started</p>
                    </div>
                    <NotificationMenu />
                </header>
            );
        }
        
        let title = "Profile"; // Fallback, though menu opens
        
        return (
            <header className="app-header mobile-generic-header">
                <button className="icon-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                    <IconMenu />
                </button>
                <h1 className="app-header-title">{title}</h1>
                <NotificationMenu />
            </header>
        );
    }
    
    // Default Desktop / Simulation Page Header
    return (
        <header className="app-header">
            <div className="app-header-left">
                 <button className="app-header-title-button" onClick={() => setPage('home')}>
                    <h1 className="app-header-title">
                        <span className="medanna-med">Med</span><span className="medanna-anna">Anna</span>
                    </h1>
                 </button>
            </div>
            <div className="app-header-right">
                {session && !isMobile && <button className="button home-button-header" onClick={() => setPage('home')}><IconHome/> <span>Home</span></button>}
                {session && <NotificationMenu />}
                {session && !isMobile && <ProfileMenu />}
                {session && isMobile && (
                    <button className="icon-button" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open menu">
                        <IconMenu />
                    </button>
                )}
                 {!session && <div/>}
            </div>
        </header>
    );
}


const AuthPage = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showSignupSuccess, setShowSignupSuccess] = useState(false);

    const handleCloseSignupModal = () => {
        setShowSignupSuccess(false);
        setIsLogin(true); // Switch to login view
        setEmail('');
        setPassword('');
        setFullName('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (isLogin) {
                await signIn({ email, password });
            } else {
                if (!fullName) {
                    setError("Full name is required.");
                    setLoading(false);
                    return;
                }
                await signUp({ email, password, fullName });
                setShowSignupSuccess(true);
            }
        } catch (err: any) {
            setError(err.message || 'An unexpected error occurred.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="app-container auth-page-wrapper">
            {showSignupSuccess && (
                <ExplanationModal
                    title="Check Your Email"
                    icon={<IconMail />}
                    iconType="info"
                    showOkButton={true}
                    onClose={handleCloseSignupModal}
                >
                    A confirmation link has been sent to your email address. Please check your inbox and click the link to verify your account.
                </ExplanationModal>
            )}
            <div className="auth-container">
                <div className="auth-decoration-panel">
                    <div className="auth-logo">
                        <span className="medanna-med">Med</span><span className="medanna-anna">Anna</span>
                    </div>
                    <p>AI-Powered Virtual Patient Simulator</p>
                    <div className="college-branding">
                        <p>Tailored for <strong>Arya College of Pharmacy</strong></p>
                        <p>B.Pharm Program</p>
                    </div>
                </div>
                <div className="auth-form-panel">
                    <div className="auth-header">
                        <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
                        <p>{isLogin ? 'Sign in to continue your practice' : 'Start your pharmaceutical care journey'}</p>
                    </div>

                    <form className="auth-form" onSubmit={handleSubmit}>
                        {!isLogin && (
                            <div className="form-group">
                                <label htmlFor="fullName">Full Name</label>
                                <input id="fullName" className="input-field" type="text" value={fullName} onChange={e => setFullName(e.target.value)} required />
                            </div>
                        )}
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input id="email" className="input-field" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label htmlFor="password">Password</label>
                            <input id="password" className="input-field" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                        </div>
                        {error && <p className="alert alert-error">{error}</p>}
                        <button type="submit" className="button button-primary" disabled={loading}>
                            {loading ? <div className="loading-spinner"></div> : (isLogin ? 'Sign In' : 'Sign Up')}
                        </button>
                    </form>
                    
                    <div className="auth-toggle">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}
                        <button onClick={() => { setIsLogin(!isLogin); setError(null); }}>
                            {isLogin ? 'Sign Up' : 'Sign In'}
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
};

const FilterSidebar = ({ filters, onFilterChange, onMultiSelectChange, onClusterChange, onRandomClusterSelection, hideTitle = false, className = '' }: {
    filters: Partial<GenerationFilters>,
    onFilterChange: (key: keyof GenerationFilters, value: any) => void,
    onMultiSelectChange: (key: 'epas' | 'specialties', value: string) => void,
    onClusterChange: (disciplineName: PharmacyArea, clusterName: string) => void,
    onRandomClusterSelection: (disciplineName: PharmacyArea, subSpecialty: PharmacySubSpecialty) => void,
    hideTitle?: boolean,
    className?: string
}) => {
    const { isMobile } = useAppContext();
    const [openDisciplines, setOpenDisciplines] = useState<string[]>(PHARMACY_DISCIPLINES.map(d => d.name));
    const [openSubSpecialties, setOpenSubSpecialties] = useState<string[]>([]);

    const toggleAccordion = (setter: React.Dispatch<React.SetStateAction<string[]>>, name: string) => {
        setter(prev => prev.includes(name) ? prev.filter(item => item !== name) : [...prev, name]);
    };

    return (
        <aside className={`filter-sidebar ${className}`}>
            {!hideTitle && <h2>Filter Your Case</h2>}
            <div className="discipline-filter-list">
                {PHARMACY_DISCIPLINES.map(discipline => {
                    const isDisciplineOpen = openDisciplines.includes(discipline.name);
                    const DisciplineIcon = discipline.icon;
                    return (
                        <div key={discipline.name} className="accordion-section">
                            <button className="accordion-header-button" onClick={() => toggleAccordion(setOpenDisciplines, discipline.name)} aria-expanded={isDisciplineOpen}>
                                <div className="discipline-header">
                                    <DisciplineIcon />
                                    <span>{discipline.name}</span>
                                </div>
                                <IconChevronDown className={`accordion-icon ${isDisciplineOpen ? 'open' : ''}`} />
                            </button>
                            {isDisciplineOpen && (
                                <div className="accordion-content">
                                    <div className="accordion-content-inner subspecialty-list">
                                        {discipline.subSpecialties.map(subSpecialty => {
                                            const isSubSpecialtyOpen = openSubSpecialties.includes(subSpecialty.name);
                                            return (
                                                <div key={subSpecialty.name} className="accordion-section sub-accordion">
                                                    <button className="accordion-header-button" onClick={() => toggleAccordion(setOpenSubSpecialties, subSpecialty.name)} aria-expanded={isSubSpecialtyOpen}>
                                                        <span>{subSpecialty.name}</span>
                                                        <div className="sub-accordion-controls">
                                                             <button
                                                                className="random-select-button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    onRandomClusterSelection(discipline.name as PharmacyArea, subSpecialty);
                                                                }}
                                                                title={`Randomly select from ${subSpecialty.name}`}
                                                                aria-label={`Randomly select from ${subSpecialty.name}`}
                                                            >
                                                                <IconDice />
                                                            </button>
                                                            <IconChevronDown className={`accordion-icon ${isSubSpecialtyOpen ? 'open' : ''}`} />
                                                        </div>
                                                    </button>
                                                    {isSubSpecialtyOpen && (
                                                        <div className="accordion-content">
                                                            <div className="accordion-content-inner cluster-list">
                                                                {subSpecialty.clusters.map(cluster => (
                                                                    <label key={cluster.name} className="disease-cluster-item">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={filters.subSpecialties?.includes(cluster.name)}
                                                                            onChange={() => onClusterChange(discipline.name as PharmacyArea, cluster.name)}
                                                                        />
                                                                        <div className="cluster-text">
                                                                            <span className="cluster-name">{cluster.name}</span>
                                                                            <span className="cluster-description">{cluster.description}</span>
                                                                        </div>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="accordion-section">
                 <button className="accordion-header-button" onClick={() => toggleAccordion(setOpenDisciplines, 'EPA Focus')} aria-expanded={openDisciplines.includes('EPA Focus')}>
                    <span>EPA Focus</span>
                    <IconChevronDown className={`accordion-icon ${openDisciplines.includes('EPA Focus') ? 'open' : ''}`} />
                </button>
                 {openDisciplines.includes('EPA Focus') && (
                    <div className="accordion-content">
                        <div className="accordion-content-inner">
                            <div className="checkbox-group">
                                {ALL_EPAS.map(e => <label key={e}><input type="checkbox" checked={filters.epas?.includes(e)} onChange={() => onMultiSelectChange('epas', e)} />{e.replace('-', ' ')}</label>)}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="filter-group challenge-mode">
                <label>
                    <input type="checkbox" checked={filters.challengeMode} onChange={e => onFilterChange('challengeMode', e.target.checked)} />
                    Challenge Mode
                </label>
                <p>Generates complex, interdisciplinary cases.</p>
            </div>
        </aside>
    );
};

const CustomCaseSummary = ({ filters, onRemoveFilter }: { filters: Partial<GenerationFilters>, onRemoveFilter: (filterKey: 'subSpecialties' | 'epas', value: string) => void }) => {
    const { subSpecialties = [], epas = [] } = filters;
    const allFilters = [
        ...subSpecialties.map(s => ({ key: 'subSpecialties' as const, value: s })),
        ...epas.map(e => ({ key: 'epas' as const, value: e })),
    ];

    const hasFilters = allFilters.length > 0;

    return (
        <div className="custom-case-summary">
            <h3>Your Custom Case</h3>
            <p>
                {hasFilters ? (
                    <>
                        You will be seeing a patient based on your selected filters.
                    </>
                ) : (
                    "You will be seeing a random patient based on your profile. Use the filters to customize."
                )}
            </p>
            {hasFilters && (
                <div className="filter-pills-container">
                    {allFilters.map(({ key, value }) => (
                        <span key={`${key}-${value}`} className="filter-pill">
                            {value}
                            <button onClick={() => onRemoveFilter(key, value)}><IconX className="filter-pill-remove" /></button>
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

const trainingPhaseInfo: Record<TrainingPhase, { icon: React.FC; description: string }> = {
    'B.Pharm Year 1': { icon: IconBook, description: "Foundational sciences and introduction to pharmacy." },
    'B.Pharm Year 2': { icon: IconFlaskConical, description: "Core pharmaceutical sciences like pharmacology & pharmaceutics." },
    'B.Pharm Year 3': { icon: IconStethoscope, description: "Focus on hospital, community, and clinical pharmacy practice." },
    'B.Pharm Year 4': { icon: IconBriefcase, description: "Advanced topics, practice school, and internship preparation." },
};

const TrainingPhaseSelector = () => {
    const { profile, updateUserTrainingPhase } = useAppContext();
    const [isUpdating, setIsUpdating] = useState<TrainingPhase | null>(null);

    const handleSelectPhase = async (phase: TrainingPhase) => {
        if (isUpdating !== null) return; // Prevent multiple clicks while an update is in progress
        setIsUpdating(phase);
        await updateUserTrainingPhase(phase);
        setIsUpdating(null);
    };

    return (
        <div className="training-phase-list">
            {ALL_TRAINING_PHASES.map(phase => {
                const info = trainingPhaseInfo[phase];
                const Icon = info.icon;
                const isSelected = profile?.training_phase === phase;

                return (
                    <button
                        key={phase}
                        className={`training-phase-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelectPhase(phase)}
                        disabled={isUpdating !== null}
                        aria-pressed={isSelected}
                    >
                        <div className="card-icon-wrapper">
                             <Icon />
                             {isUpdating === phase && <div className="loading-spinner-overlay"><div className="loading-spinner"></div></div>}
                        </div>
                        <div className="card-content">
                            <h4>{phase}</h4>
                            <p>{info.description}</p>
                        </div>
                    </button>
                );
            })}
        </div>
    );
};


const SelectionList = ({ items, selectedItems, onSelect }: { items: { id: string, label: string, icon: React.FC }[], selectedItems: string[], onSelect: (id: string) => void }) => {
    return (
        <div className="selection-list">
            {items.map(item => {
                const isSelected = selectedItems.includes(item.id);
                const Icon = item.icon;
                return (
                    <button key={item.id} className={`selection-item ${isSelected ? 'selected' : ''}`} onClick={() => onSelect(item.id)}>
                        <div className="selection-item-icon"><Icon /></div>
                        <span className="selection-item-label">{item.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

const NewCaseTab = () => {
    const { profile, handleGenerateAndStart, isGenerating, generationError, isMobile, setHomeTab } = useAppContext();
    const [filters, setFilters] = useState<Partial<GenerationFilters>>({
        trainingPhase: profile?.training_phase || undefined,
        specialties: [],
        subSpecialties: [], // This now corresponds to clusters
        epas: [],
        challengeMode: false,
    });
    const [simSetupTab, setSimSetupTab] = useState<'Phase' | 'Specialty' | 'EPA'>('Phase');

    useEffect(() => {
        if (profile?.training_phase) {
            setFilters(prev => ({ ...prev, trainingPhase: profile.training_phase as TrainingPhase }));
        }
    }, [profile]);

    const handleFilterChange = (filterKey: keyof GenerationFilters, value: any) => {
        setFilters(prev => ({ ...prev, [filterKey]: value }));
    };

    const handleMultiSelectChange = (filterKey: 'specialties' | 'epas', value: string) => {
        setFilters(prev => {
            if (filterKey === 'epas') {
                const currentValues = prev.epas || [];
                const typedValue = value as EPA;
                const newValues = currentValues.includes(typedValue)
                    ? currentValues.filter(v => v !== typedValue)
                    : [...currentValues, typedValue];
                return { ...prev, epas: newValues };
            }
            return prev;
        });
    };
    
    const handleClusterChange = (disciplineName: PharmacyArea, clusterName: string) => {
        setFilters(prev => {
            const { subSpecialties = [], specialties = [] } = prev;
            const isChecked = !subSpecialties.includes(clusterName);

            // Update clusters (stored in subSpecialties property)
            const newClusters = isChecked
                ? [...subSpecialties, clusterName]
                : subSpecialties.filter(c => c !== clusterName);
            
            // Update parent disciplines
            const currentDisciplines = new Set(specialties as PharmacyArea[]);
            if (isChecked) {
                currentDisciplines.add(disciplineName);
            } else {
                const disciplineHasOtherClusters = PHARMACY_DISCIPLINES
                    .find(d => d.name === disciplineName)?.subSpecialties
                    .flatMap(ss => ss.clusters)
                    .some(c => newClusters.includes(c.name));

                if (!disciplineHasOtherClusters) {
                    currentDisciplines.delete(disciplineName);
                }
            }

            return {
                ...prev,
                subSpecialties: newClusters,
                specialties: Array.from(currentDisciplines),
            };
        });
    };

    const handleRandomClusterSelection = (disciplineName: PharmacyArea, subSpecialty: PharmacySubSpecialty) => {
        const allClusterNames = subSpecialty.clusters.map(c => c.name);
        if (allClusterNames.length === 0) return;
    
        // Decide how many to select. 1 or 2, but no more than available.
        const maxToSelect = Math.min(2, allClusterNames.length);
        const numToSelect = Math.floor(Math.random() * maxToSelect) + 1;
    
        // Randomly pick clusters
        const shuffled = [...allClusterNames].sort(() => 0.5 - Math.random());
        const selectedClusters = shuffled.slice(0, numToSelect);
    
        setFilters(prev => {
            const { subSpecialties = [] } = prev;
            
            // Uncheck all clusters from this subspecialty first
            const otherClusters = subSpecialties.filter(c => !allClusterNames.includes(c));
    
            // Add the new random ones
            const newClusters = [...otherClusters, ...selectedClusters];
    
            // Re-calculate all parent disciplines based on the new full list of clusters
            const newDisciplines = new Set<PharmacyArea>();
            for (const cluster of newClusters) {
                for (const discipline of PHARMACY_DISCIPLINES) {
                    if (discipline.subSpecialties.some(ss => ss.clusters.some(c => c.name === cluster))) {
                        newDisciplines.add(discipline.name as PharmacyArea);
                        break;
                    }
                }
            }
            
            return {
                ...prev,
                subSpecialties: newClusters,
                specialties: Array.from(newDisciplines),
            };
        });
    };

    const handleRemoveFilter = (filterKey: 'subSpecialties' | 'epas', value: string) => {
        if (filterKey === 'subSpecialties') {
            const discipline = PHARMACY_DISCIPLINES.find(d => 
                d.subSpecialties.some(ss => ss.clusters.some(c => c.name === value))
            );
            if (discipline) {
                handleClusterChange(discipline.name as PharmacyArea, value);
            }
        } else { // 'epas'
            handleMultiSelectChange('epas', value);
        }
    };


    const epaItems = [
        { id: 'History-taking', label: 'History Taking', icon: IconFileText },
        { id: 'Patient Counseling', label: 'Counseling', icon: IconUsers },
        { id: 'Intervention', label: 'Intervention', icon: IconClipboardList },
        { id: 'Documentation', label: 'Documentation', icon: IconFileText },
    ];
    
    const handleGenerateClick = () => {
        if (!profile || !profile.training_phase) return;
        handleGenerateAndStart({
            trainingPhase: profile.training_phase as TrainingPhase,
            specialties: filters.specialties as PharmacyArea[],
            subSpecialties: filters.subSpecialties,
            epas: filters.epas,
            challengeMode: filters.challengeMode,
        });
    };

    if (isMobile) {
        const handleNextStep = () => {
            if (simSetupTab === 'Phase') {
                if (profile?.training_phase) {
                    setSimSetupTab('Specialty');
                }
            } else if (simSetupTab === 'Specialty') {
                setSimSetupTab('EPA');
            } else if (simSetupTab === 'EPA') {
                handleGenerateClick();
            }
        };

        const handleBackStep = () => {
            if (simSetupTab === 'EPA') {
                setSimSetupTab('Specialty');
            } else if (simSetupTab === 'Specialty') {
                setSimSetupTab('Phase');
            } else { // 'Phase'
                setHomeTab('home');
            }
        };

        return (
            <div className="new-case-tab-mobile">
                 <header className="app-header mobile-generic-header standalone">
                    <button className="icon-button" onClick={handleBackStep}><IconChevronLeft /></button>
                    <h1 className="app-header-title">Simulation Setup</h1>
                    <div style={{width: 40}}></div>
                </header>
                
                <div className="mobile-tab-content">
                    {simSetupTab === 'Phase' && (
                         <div className="training-phase-section mobile">
                            <h2>Select Your Training Phase</h2>
                            <p>This tailors case difficulty and is saved to your profile for future sessions.</p>
                            <TrainingPhaseSelector />
                        </div>
                    )}
                    {simSetupTab === 'Specialty' && (
                        <div className="specialty-section mobile">
                            <h2>Choose your Practice Area</h2>
                            <p>Select topics from any specialty.</p>
                             <FilterSidebar
                                filters={filters}
                                onFilterChange={handleFilterChange}
                                onMultiSelectChange={handleMultiSelectChange}
                                onClusterChange={handleClusterChange}
                                onRandomClusterSelection={handleRandomClusterSelection}
                                hideTitle={true}
                                className="in-modal"
                            />
                        </div>
                    )}
                    {simSetupTab === 'EPA' && (
                         <div className="specialty-section mobile epa-section">
                            <h2>EPA Focus</h2>
                            <SelectionList items={epaItems} selectedItems={filters.epas || []} onSelect={(id) => handleMultiSelectChange('epas', id)} />

                            <div className="challenge-mode-mobile">
                                <div className="challenge-mode-text">
                                    <h3>Challenge mode</h3>
                                    <p>Generates complex, interdisciplinary cases</p>
                                </div>
                                <label className="switch">
                                    <input type="checkbox" checked={filters.challengeMode} onChange={e => handleFilterChange('challengeMode', e.target.checked)} />
                                    <span className="slider"></span>
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="mobile-start-button-container">
                    <button
                        className="button button-primary generate-button"
                        onClick={handleNextStep}
                        disabled={isGenerating || !profile?.training_phase}
                        title={!profile?.training_phase ? "Please select a training phase first" : "Start a new case"}
                    >
                        {isGenerating ? <div className="loading-spinner"></div> : (simSetupTab === 'EPA' ? "Start Simulation" : "Next")}
                    </button>
                     {!profile?.training_phase && simSetupTab === 'Phase' && <p className="alert alert-inline">Please select a training phase to start.</p>}
                    {generationError && <p className="alert alert-error">{generationError}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="generation-section">
            <FilterSidebar
                filters={filters}
                onFilterChange={handleFilterChange}
                onMultiSelectChange={handleMultiSelectChange}
                onClusterChange={handleClusterChange}
                onRandomClusterSelection={handleRandomClusterSelection}
            />

            <div className="generation-main-content">
                <div className="training-phase-section">
                    <h2>1. Select Your Training Phase</h2>
                    <p>This tailors case difficulty and is saved to your profile for future sessions.</p>
                    <TrainingPhaseSelector />
                </div>

                <div className="custom-case-generation">
                    <h2>2. Configure & Start Simulation</h2>
                    
                    <CustomCaseSummary filters={filters} onRemoveFilter={handleRemoveFilter} />

                    <button
                        className="button button-primary generate-button"
                        onClick={handleGenerateClick}
                        disabled={isGenerating || !profile?.training_phase}
                        title={!profile?.training_phase ? "Please select a training phase first" : "Start a new case"}
                    >
                        {isGenerating ? <div className="loading-spinner"></div> : "Start Simulation"}
                    </button>
                    {!profile?.training_phase && <p className="alert alert-inline">Please select a training phase to start.</p>}
                    {generationError && <p className="alert alert-error">{generationError}</p>}
                </div>
            </div>
        </div>
    );
};

const BottomNavBar = () => {
    const { homeTab, setHomeTab, setIsMobileMenuOpen } = useAppContext();

    const TABS: { id: HomeTab; icon: React.FC<{className?: string, isActive?: boolean}>; label: string }[] = [
        { id: 'home', icon: IconHome, label: 'Home' },
        { id: 'case', icon: IconDashboard, label: 'Case' },
        { id: 'profile', icon: IconUser, label: 'Profile' },
    ];
    
    const handleNavClick = (tabId: HomeTab) => {
        if (tabId === 'profile') {
            setIsMobileMenuOpen(true);
        } else {
            setHomeTab(tabId);
        }
    }

    return (
        <div className="bottom-nav-bar">
            <nav>
                {TABS.map(tab => {
                    const Icon = tab.icon;
                    const isActive = homeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            className={`nav-item ${isActive ? 'active' : ''}`}
                            onClick={() => handleNavClick(tab.id)}
                            aria-label={tab.label}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <Icon className="nav-icon" isActive={isActive}/>
                            <span className="nav-label">{tab.label}</span>
                        </button>
                    )
                })}
            </nav>
        </div>
    )
}

const PromoBanner = () => (
    <div className="promo-banner">
        <IconGift />
        <div className="promo-banner-text">
            <strong>Get Free access for 1 month</strong>
            <span>Valid till 31st August.</span>
        </div>
    </div>
);

const StartSimCard = ({ onStart }: { onStart: () => void }) => (
    <div className="start-sim-card">
        <h2>Talk to your Virtual Patient</h2>
        <p>Simulate Real Patient Interactions. Provide Pharmaceutical Care.</p>
        <button onClick={onStart} aria-label="Start Now">
            <IconArrowRight />
        </button>
    </div>
);

const AivanaFooter = () => (
    <div className="aivana-footer">
        from <strong>Aivana</strong>
    </div>
);

const BetaWarningBanner = () => (
    <div className="beta-warning-banner">
        <IconAlertTriangle className="beta-warning-icon" />
        <p>
            <strong>Beta Stage:</strong> This app is in a testing phase and may contain inaccuracies. Please use for educational purposes only.
        </p>
    </div>
);

const HomePage = () => {
    const { profile, homeTab, setHomeTab, isMobile } = useAppContext();

    const renderMobileContent = () => {
        switch(homeTab) {
            case 'case': return <NewCaseTab />;
            case 'home':
            default:
                return (
                    <div className="home-dashboard">
                        <BetaWarningBanner />
                        <PromoBanner />
                        <StartSimCard onStart={() => setHomeTab('case')} />
                        <AivanaFooter />
                    </div>
                );
        }
    }

    if (isMobile) {
        return (
            <main className="app-container home-page mobile-view">
                <div className="home-content-mobile">
                    {renderMobileContent()}
                </div>
                <BottomNavBar />
            </main>
        )
    }

    return (
        <main className="app-container home-page desktop-view">
            <BetaWarningBanner />
            <div className="home-header">
                <h1>Welcome back, {profile?.full_name?.split(' ')[0] || 'Pharmacist'}!</h1>
                <p>Your next patient is waiting. Time to provide pharmaceutical care.</p>
            </div>
            
            <div className="home-page-layout">
                <div className="home-page-main">
                    <div className="home-content">
                       <NewCaseTab />
                    </div>
                </div>
            </div>
        </main>
    );
};


const GeneratingCaseSplash = () => {
    const { generationFilters } = useAppContext();
    const [fact, setFact] = useState('');
    const [fade, setFade] = useState(true);

    const getFactsPool = useCallback(() => {
        const specialties = generationFilters?.specialties;
        if (specialties && specialties.length > 0) {
            const specialtyFacts = specialties.flatMap(s => MEDICAL_FUN_FACTS[s as PharmacyArea] || []);
            if (specialtyFacts.length > 0) return specialtyFacts;
        }
        return MEDICAL_FUN_FACTS['General'];
    }, [generationFilters]);
    
    useEffect(() => {
        const factsPool = getFactsPool();
        // Set initial fact, ensure it's not undefined if pool is empty
        setFact(factsPool[Math.floor(Math.random() * factsPool.length)] || "Loading...");

        const interval = setInterval(() => {
            setFade(false); // Start fade out
            setTimeout(() => {
                setFact(currentFact => {
                    const currentPool = getFactsPool(); // Re-evaluate pool in case filters changed
                    if (currentPool.length === 0) return "Loading...";
                    let newFact;
                    do {
                        newFact = currentPool[Math.floor(Math.random() * currentPool.length)];
                    } while (newFact === currentFact && currentPool.length > 1); // Avoid repeating the same fact
                    return newFact;
                });
                setFade(true); // Start fade in
            }, 500); // Time for fade out transition
        }, 5000); // Change fact every 5 seconds

        return () => clearInterval(interval);
    }, [getFactsPool]);


    return (
        <div className="splash-overlay">
            <div className="splash-content">
                <div className="ekg-animation">
                    <svg viewBox="0 0 100 30">
                        <path className="ekg-path" d="M0 15 L20 15 L25 10 L35 20 L40 15 L45 15 L50 22 L55 8 L60 15 L100 15" fill="none" strokeWidth="1" />
                    </svg>
                </div>
                <h2>Preparing Your Simulation...</h2>
                <p>Please wait while we set up your custom patient encounter.</p>

                <div className="fun-fact-box">
                    <h3>Did you know?</h3>
                    <p className={`fun-fact-text ${fade ? 'fade-in' : 'fade-out'}`}>{fact}</p>
                </div>
            </div>
        </div>
    );
};

const AuthCallbackPage = () => {
    const { isAuthLoading, setPage } = useAppContext();

    useEffect(() => {
        // The onAuthStateChange listener in AppContextProvider is handling the actual auth.
        // This component just provides a UI during the process.
        // When auth is no longer loading, we have a result.
        if (!isAuthLoading) {
            // Redirect to the home page. The App component will then render the
            // correct view based on whether the session is available.
            setPage('home');
            // Clean up the URL, removing the path and any tokens in the hash.
            window.history.replaceState({}, document.title, "/");
        }
    }, [isAuthLoading, setPage]);

    return (
        <div className="splash-overlay">
            <div className="splash-content">
                <div className="loading-spinner"></div>
                <h2>Verifying Your Account...</h2>
                <p>Please wait, you will be redirected shortly.</p>
            </div>
        </div>
    );
};

const ExplanationModal = ({ title, children, icon, iconType = 'info', onClose, showOkButton = false }: { title: string, children: ReactNode, icon?: ReactNode, iconType?: 'success' | 'info' | 'danger', onClose: () => void, showOkButton?: boolean }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose]);

    return (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2 id="modal-title">{title}</h2>
                    <button className="close-button" onClick={onClose} aria-label="Close">
                        <IconClose />
                    </button>
                </div>
                <div className="modal-body">
                    {icon && <div className={`modal-icon-wrapper modal-icon-${iconType}`}>{icon}</div>}
                    <div style={{ whiteSpace: 'pre-wrap', textAlign: icon ? 'center' : 'left' }}>{children}</div>
                </div>
                {showOkButton && (
                    <div className="modal-footer">
                        <button className="button button-primary" onClick={onClose}>OK</button>
                    </div>
                )}
            </div>
        </div>
    );
};


const AccordionSection = ({ title, children, defaultOpen = false }: { title: string, children: ReactNode, defaultOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    const toggleSection = () => setIsOpen(prev => !prev);
    
    return (
        <div className={`accordion-section ${isOpen ? 'open' : ''}`}>
            <button className="accordion-header-button" onClick={toggleSection} aria-expanded={isOpen}>
                <span>{title}</span>
                <IconChevronDown className="accordion-icon" />
            </button>
            <div className="accordion-content" hidden={!isOpen}>
                <div className="accordion-content-inner">{children}</div>
            </div>
        </div>
    );
};

const CaseTagsDisplay = ({ tags }: { tags: CaseTags | undefined }) => {
    if (!tags) return null;
    const { specialty, trainingPhase, cognitiveSkill, epas } = tags;
    return (
        <div className="case-tags">
            <span className="tag-badge tag-specialty">{specialty}</span>
            <span className="tag-badge tag-phase">{trainingPhase}</span>
            <span className="tag-badge tag-skill">{cognitiveSkill}</span>
            {epas.map(epa => <span key={epa} className="tag-badge tag-epa">{epa}</span>)}
        </div>
    );
};

const CaseInfoPanel = React.memo(({ currentCase }: { currentCase: PharmacyCase | null }) => {
    const { isMobile } = useAppContext();

    if (!currentCase) {
        return <div className="panel case-info-panel"><p>Loading case...</p></div>;
    }
    
    return (
        <div className="panel case-info-panel">
             <div className="panel-header">
                <h2>{currentCase.title}</h2>
                <CaseTagsDisplay tags={currentCase.tags} />
                <p className="case-subtitle">{currentCase.patientProfile.name}, {currentCase.patientProfile.age}, {currentCase.patientProfile.gender}</p>
            </div>
            <div className="panel-content">
                <AccordionSection title="Chief Complaint" defaultOpen={true}>
                    <p className="chief-complaint-text">"{currentCase.chiefComplaint}"</p>
                </AccordionSection>
                <AccordionSection title="History of Present Illness" defaultOpen={true}>
                    <p>{currentCase.historyOfPresentIllness}</p>
                </AccordionSection>
                <AccordionSection title="Medication History" defaultOpen={true}>
                    <p>{currentCase.medicationHistory}</p>
                </AccordionSection>
                <AccordionSection title="Pharmacy Competency">
                    <p>{currentCase.tags.curriculum.competency}</p>
                </AccordionSection>
            </div>
        </div>
    )
});

// A more sophisticated parser for lab results
const parseComplexLabResult = (testName: string, fullLabString: string): { type: 'values' | 'report' | 'simple'; data: any } => {
    const imagingTests = ALL_INVESTIGATIONS['Imaging'];
    const complexValueTests = ['CBC', 'CMP', 'Lipid Profile', 'LFT', 'RFT', 'Coagulation Profile'];

    const regex = new RegExp(`${testName}\\s*:\\s*([^\\r\\n]*)`, 'i');
    const match = fullLabString.match(regex);
    const resultString = match ? match[1].trim() : 'Result not available in this case.';

    if (resultString === 'Result not available in this case.') {
        return { type: 'simple', data: resultString };
    }

    if (imagingTests.includes(testName)) {
        return { type: 'report', data: resultString };
    }

    if (complexValueTests.includes(testName)) {
        const parts = resultString.split(',').map(p => p.trim());
        const values = parts.map(part => {
            const firstSpaceIndex = part.indexOf(' ');
            if (firstSpaceIndex === -1) {
                // Handle cases with no space, or single-word results like "Normal"
                return { name: part, value: '' }; 
            }
            const name = part.substring(0, firstSpaceIndex);
            const value = part.substring(firstSpaceIndex + 1).trim();
            return { name, value };
        });
        return { type: 'values', data: values };
    }

    // Default to simple display for other tests (e.g., Troponin, ESR)
    return { type: 'simple', data: resultString };
};


const LabResultCard = ({ testName, labResultsString }: { testName: string, labResultsString: string }) => {
    const parsedResult = parseComplexLabResult(testName, labResultsString);

    return (
        <div className="result-card">
            <div className="result-card-header">
                <h3>{testName}</h3>
            </div>
            <div className="result-card-body">
                {parsedResult.type === 'values' && (
                    <div className="result-parameter-grid">
                        {parsedResult.data.map((param: { name: string, value: string }, index: number) => (
                            <div key={index} className="result-parameter-item">
                                <span className="result-parameter-name">{param.name}</span>
                                <span className="result-parameter-value">{param.value}</span>
                            </div>
                        ))}
                    </div>
                )}
                {parsedResult.type === 'report' && (
                    <p className="result-report-text">{parsedResult.data}</p>
                )}
                {parsedResult.type === 'simple' && (
                     <div className="result-parameter-item simple">
                        <span className="result-parameter-name">{testName}</span>
                        <span className="result-parameter-value">{parsedResult.data}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

const LabsPanel = React.memo(({ orderedInvestigations, onOrderInvestigation, labResultsString }: { orderedInvestigations: string[], onOrderInvestigation: (test: string) => void, labResultsString: string }) => {
    const [activeSubTab, setActiveSubTab] = useState<'order' | 'view'>('order');

    return (
        <div className="panel labs-panel">
            <div className="panel-header">
                <div className="sub-tab-nav">
                    <button className={`sub-tab-button ${activeSubTab === 'order' ? 'active' : ''}`} onClick={() => setActiveSubTab('order')}>Order Tests</button>
                    <button className={`sub-tab-button ${activeSubTab === 'view' ? 'active' : ''}`} onClick={() => setActiveSubTab('view')}>View Results</button>
                </div>
            </div>
            {activeSubTab === 'order' ? (
                <div className="panel-content investigations-content">
                    {Object.entries(ALL_INVESTIGATIONS).map(([category, tests]) => (
                        <AccordionSection key={category} title={category} defaultOpen={true}>
                            <div className="investigation-buttons">
                                {tests.map(test => {
                                    const isOrdered = orderedInvestigations.includes(test);
                                    return (
                                        <button
                                            key={test}
                                            className={`investigation-button ${isOrdered ? 'ordered' : ''}`}
                                            onClick={() => onOrderInvestigation(test)}
                                            disabled={isOrdered}
                                        >
                                            {test}
                                        </button>
                                    );
                                })}
                            </div>
                        </AccordionSection>
                    ))}
                </div>
            ) : (
                <div className="panel-content results-content">
                    {orderedInvestigations.length === 0 ? (
                        <div className="info-box">
                            <IconFlaskConical />
                            No investigations ordered yet. Go to the 'Order Tests' tab to order tests.
                        </div>
                    ) : (
                        <div className="results-list">
                            {orderedInvestigations.map(test => (
                                <LabResultCard key={test} testName={test} labResultsString={labResultsString} />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});


const ProblemIdentificationPanel = React.memo(({
    onFinish,
    isFinishing
}: {
    onFinish: (selectedProblem: string) => void;
    isFinishing: boolean;
}) => {
    const { currentCase } = useAppContext();
    const [selectedOption, setSelectedOption] = useState<string | null>(null);

    if (!currentCase) return <div className="panel actions-panel"><p>Loading...</p></div>;

    const { drugRelatedProblems } = currentCase;
    
    const handleFinishClick = () => {
        if (selectedOption) {
            onFinish(selectedOption);
        }
    };

    return (
        <div className="panel diagnosis-panel">
            <div className="panel-header">
                <h3>Identify Drug-Related Problem (DRP)</h3>
            </div>
            <div className="panel-content">
                <p className="panel-instructions">Select the most likely DRP and submit to end the case.</p>
                <div className="choice-options">
                    {drugRelatedProblems.map(({ problem }) => (
                        <button
                            key={problem}
                            className={`choice-option ${selectedOption === problem ? 'selected' : ''}`}
                            onClick={() => setSelectedOption(problem)}
                            aria-pressed={selectedOption === problem}
                        >
                            {problem}
                        </button>
                    ))}
                </div>
                <div className="finish-case-action">
                    <button
                        className="button button-primary"
                        onClick={handleFinishClick}
                        disabled={!selectedOption || isFinishing}
                    >
                        {isFinishing && <div className="loading-spinner"></div>}
                        Submit & Finish Case
                    </button>
                </div>
            </div>
        </div>
    );
});

const ParsedExamDisplay = ({ examString }: { examString: string }) => {
    // Memoize parsing logic to be more robust against formatting variations.
    const sections = useMemo(() => {
        if (!examString || !examString.trim()) return [];

        // Regex to split the string by section headers (e.g., "Vitals:", "General:").
        // This splits the string before a line that looks like a header, keeping the header.
        const parts = examString.split(/\n(?=[\w\s]+:\s*)/).filter(p => p.trim());

        const parsedSections: { title: string; content: string[] }[] = [];

        parts.forEach(part => {
            const lines = part.trim().split('\n');
            const titleLine = lines.shift() || ''; // Get the first line as the title
            
            const colonIndex = titleLine.indexOf(':');
            if (colonIndex === -1) {
                // This part doesn't have a recognizable title line.
                // If a previous section exists, append this content to it.
                if (parsedSections.length > 0) {
                    parsedSections[parsedSections.length - 1].content.push(part.trim());
                } else {
                    // Otherwise, create a new section with a generic title.
                    parsedSections.push({ title: 'Examination Findings', content: [part.trim()] });
                }
                return;
            }

            const title = titleLine.substring(0, colonIndex).trim();
            const firstLineContent = titleLine.substring(colonIndex + 1).trim();

            // Combine content from the title line with subsequent lines
            const content = [
                ...(firstLineContent ? [firstLineContent] : []), 
                ...lines.map(l => l.trim())
            ].filter(Boolean); // Filter out any empty lines that might result

            if (content.length > 0) {
                parsedSections.push({ title, content });
            }
        });

        // Final fallback: If no sections were parsed but the string has content, show it all under one header.
        if (parsedSections.length === 0 && examString.trim().length > 0) {
            return [{ title: 'Examination Findings', content: [examString.trim()] }];
        }

        return parsedSections;
    }, [examString]);

    const getIconForSection = (title: string) => {
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes('vitals')) return <IconHeart />;
        if (lowerTitle.includes('general')) return <IconUser />;
        return <IconStethoscope />;
    };
    
    // Add a check to show a message if parsing results in no displayable content
    if (sections.length === 0) {
        return (
            <div className="info-box">
                <IconFileText />
                Physical examination data is not available for this case.
            </div>
        );
    }

    return (
        <div className="parsed-exam-display">
            {sections.map((section, index) => {
                const isVitals = section.title.toLowerCase().includes('vitals');
                return (
                    <div key={index} className="exam-section">
                        <div className="exam-section-header">
                            {getIconForSection(section.title)}
                            <h4>{section.title}</h4>
                        </div>
                        <div className="exam-section-content">
                            {isVitals ? (
                                <div className="vitals-grid">
                                    {section.content.flatMap((item, itemIndex) => {
                                        // A single line can contain multiple vitals, e.g., "BP: 120/80, HR: 72"
                                        const individualVitals = item.split(',').map(v => v.trim()).filter(Boolean);
                                        return individualVitals.map((vital, vitalIndex) => {
                                            const parts = vital.split(':');
                                            const label = parts[0]?.trim();
                                            const value = parts.slice(1).join(':').trim();
                                            if (!label || !value) return null; // Skip malformed entries
                                            return (
                                                <div key={`${itemIndex}-${vitalIndex}`} className="vitals-item">
                                                    <span className="vitals-label">{label}</span>
                                                    <span className="vitals-value">{value}</span>
                                                </div>
                                            );
                                        }).filter(Boolean); // Filter out nulls from malformed entries
                                    })}
                                </div>
                            ) : (
                                <p className="exam-finding-text">
                                    {section.content.join('\n')}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


const PhysicalExamPanel = React.memo(({ physicalExamString }: { physicalExamString: string }) => {
    return (
        <div className="panel physical-exam-panel">
             <div className="panel-header">
                <h3>Physical Examination</h3>
            </div>
            <div className="panel-content">
                 <ParsedExamDisplay examString={physicalExamString} />
            </div>
        </div>
    );
});

const ChatWindow = ({
    chat,
    messages,
    setMessages,
    setLatestPatientMessage,
    profile,
    currentCase
}: {
    chat: Chat | null;
    messages: ChatMessage[];
    setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
    setLatestPatientMessage: (message: string | null) => void;
    profile: Profile | null,
    currentCase: PharmacyCase | null,
}) => {
    const [userInput, setUserInput] = useState('');
    const [isResponding, setIsResponding] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userInput.trim() || !chat || isResponding) return;

        const userMessage: ChatMessage = {
            sender: 'user',
            text: userInput,
            timestamp: new Date().toISOString()
        };
        
        const patientThinkingMessage: ChatMessage = {
            sender: 'patient',
            text: '...',
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage, patientThinkingMessage]);
        setUserInput('');
        setIsResponding(true);
        setLatestPatientMessage('thinking'); // Use a special keyword to stop any current speech

        try {
            const response = await chat.sendMessage({ message: userInput });
            const patientResponseText = response.text;

            const patientMessage: ChatMessage = {
                sender: 'patient',
                text: patientResponseText,
                timestamp: new Date().toISOString()
            };

            setMessages(prev => [...prev.slice(0, -1), patientMessage]);
            setLatestPatientMessage(patientResponseText);

        } catch (error) {
            console.error("Error sending message:", error);
            const errorMessage: ChatMessage = {
                sender: 'system',
                text: "Sorry, I'm having trouble responding right now. Please try again.",
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev.slice(0, -1), errorMessage]);
            setLatestPatientMessage(null); // Clear on error
        } finally {
            setIsResponding(false);
        }
    };

    return (
        <>
            <div className="chat-window">
                {messages.map((msg, index) => (
                     <div key={index} className={`chat-message ${msg.sender}`}>
                        {msg.sender === 'patient' && (
                             <div className="chat-avatar">
                                {getInitials(currentCase?.patientProfile.name)}
                            </div>
                        )}
                        <div className="message-bubble">
                            {msg.text === '...' ? <div className="typing-indicator"><span></span><span></span><span></span></div> : msg.text}
                        </div>
                         {msg.sender === 'user' && (
                            <div className="chat-avatar user-avatar">
                                {getInitials(profile?.full_name)}
                            </div>
                        )}
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
            <form className="chat-input-form" onSubmit={handleSendMessage}>
                <input
                    type="text"
                    className="chat-input"
                    placeholder="Ask a question..."
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    disabled={isResponding}
                    aria-label="Your message"
                />
                <button type="submit" className="send-button" disabled={isResponding || !userInput.trim()} aria-label="Send message">
                   {isResponding ? <div className="loading-spinner"></div> : <IconSend/>}
                </button>
            </form>
        </>
    );
};

const SimulationMobileHeader = ({ activeTab, setActiveTab, onBack }: { activeTab: SimulationTab, setActiveTab: (tab: SimulationTab) => void, onBack: () => void }) => {
    const TABS: { id: SimulationTab; label: string }[] = useMemo(() => [
        { id: 'case', label: 'Case' },
        { id: 'chat', label: 'Chat' },
        { id: 'exam', label: 'Exam' },
        { id: 'labs', label: 'Labs' },
        { id: 'problem', label: 'DRP' },
    ], []);
    
    return (
        <header className="simulation-mobile-header">
            <button onClick={onBack} className="back-button" aria-label="End Simulation"><IconClose /></button>
            <nav className="mobile-tab-nav">
                {TABS.map(tab => (
                    <button 
                        key={tab.id}
                        className={`tab-nav-button ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
        </header>
    );
};


const SimulationPage = () => {
    const { 
        currentCase, isMobile, setPage, 
        hintCount, updateHintCount, profile, setSimulationResult
    } = useAppContext();
    
    const [activeTab, setActiveTab] = useState<SimulationTab>(isMobile ? 'case' : 'chat');
    const [isFinishing, setIsFinishing] = useState(false);
    const [latestPatientMessage, setLatestPatientMessage] = useState<string | null>(null);
    const [orderedInvestigations, setOrderedInvestigations] = useState<string[]>([]);

    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isGeneratingHint, setIsGeneratingHint] = useState(false);
    const messagesRef = useRef(messages);
    messagesRef.current = messages;

    const startTimeRef = useRef<number>(Date.now());

    useEffect(() => {
        if (!currentCase) return;

        // Reset all state for new case
        setActiveTab(isMobile ? 'case' : 'chat');
        setIsFinishing(false);
        setLatestPatientMessage(null);
        setIsGeneratingHint(false);
        setOrderedInvestigations([]);
        startTimeRef.current = Date.now();

        const chatHistoryKey = `chatHistory_${currentCase.title}`;
        let initialMessages: ChatMessage[] = [];
        try {
            const savedMessages = localStorage.getItem(chatHistoryKey);
            if (savedMessages) initialMessages = JSON.parse(savedMessages);
        } catch (error) {
            console.error("Failed to parse chat history from localStorage.", error);
            localStorage.removeItem(chatHistoryKey);
        }
        setMessages(initialMessages);
        
        const chatInstance = createChatForCase(currentCase);
        setChat(chatInstance);

        return () => {
            if (messagesRef.current.length > 0) {
                localStorage.setItem(chatHistoryKey, JSON.stringify(messagesRef.current));
            } else {
                localStorage.removeItem(chatHistoryKey);
            }
        };
    }, [currentCase, isMobile]);

    const handleOrderInvestigation = (test: string) => {
        if (!orderedInvestigations.includes(test)) {
            setOrderedInvestigations(prev => [...prev, test]);
        }
    };

    const handleRequestHint = async () => {
        if (!currentCase || hintCount <= 0 || isGeneratingHint) return;
        setIsGeneratingHint(true);
        try {
            const newHint = await generateHint(currentCase, messages);
            const hintMessage: ChatMessage = { sender: 'system', text: newHint, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, hintMessage]);
            updateHintCount(hintCount - 1);
        } catch (error) {
            console.error("Hint generation failed:", error);
            const errorMessage: ChatMessage = { sender: 'system', text: "Sorry, I couldn't generate a hint right now.", timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsGeneratingHint(false);
        }
    };

    const handleFinishCase = useCallback(async (selectedProblem: string) => {
        if (!currentCase) return;
        setIsFinishing(true);

        const timeTaken = Math.round((Date.now() - startTimeRef.current) / 1000);
        const correctProblem = currentCase.drugRelatedProblems.find(d => d.isCorrect)?.problem;
        const isCorrect = selectedProblem === correctProblem;

        setSimulationResult({
            problemCorrect: isCorrect,
            timeTaken,
            selectedProblem
        });

        try {
            const chatHistoryKey = `chatHistory_${currentCase.title}`;
            localStorage.removeItem(chatHistoryKey);
        } catch(error) {
            console.error("Error clearing chat history:", error);
        } finally {
            setIsFinishing(false);
            setPage('debrief');
        }
    }, [currentCase, setPage, setSimulationResult]);

    if (!currentCase) return null;

    if (isMobile) {
        return (
            <main className={`app-container simulation-page mobile-view tab-${activeTab} ${activeTab !== 'chat' ? 'no-patient-video' : ''}`}>
                {activeTab === 'chat' && <PatientVisualizer latestPatientMessage={latestPatientMessage} />}
                <div className="simulation-mobile-overlay">
                    <SimulationMobileHeader activeTab={activeTab} setActiveTab={setActiveTab} onBack={() => setPage('home')} />
                    
                    {activeTab === 'chat' && (
                        <div className="simulation-video-controls">
                            <button 
                                className="overlay-button hint-button-mobile" 
                                onClick={handleRequestHint} 
                                disabled={isGeneratingHint || hintCount <= 0}
                                aria-label={`Get a hint (${hintCount} remaining)`}
                            >
                                <IconLightbulb/>
                                {hintCount > 0 && <span className="hint-badge">{hintCount}</span>}
                            </button>
                        </div>
                    )}

                    <div className="simulation-mobile-content">
                        {activeTab === 'chat' && 
                            <ChatWindow 
                                chat={chat} messages={messages} setMessages={setMessages}
                                setLatestPatientMessage={setLatestPatientMessage}
                                profile={profile} currentCase={currentCase}
                            />
                        }
                        {activeTab === 'case' && <CaseInfoPanel currentCase={currentCase} />}
                        {activeTab === 'exam' && <PhysicalExamPanel physicalExamString={currentCase.physicalExam} />}
                        {activeTab === 'labs' && <LabsPanel orderedInvestigations={orderedInvestigations} onOrderInvestigation={handleOrderInvestigation} labResultsString={currentCase.labResults} />}
                        {activeTab === 'problem' && <ProblemIdentificationPanel onFinish={handleFinishCase} isFinishing={isFinishing} />}
                    </div>
                </div>
            </main>
        );
    }
    
    return (
        <main className="app-container simulation-page desktop-view">
            <CaseInfoPanel currentCase={currentCase} />
            <div className="central-panel">
                {activeTab === 'chat' ? (
                    <PatientVisualizer latestPatientMessage={latestPatientMessage} />
                ) : (
                    <div className="central-panel-placeholder">
                        {activeTab === 'exam' && <><IconStethoscope /><p>Physical Examination</p></>}
                        {activeTab === 'labs' && <><IconFlaskConical /><p>Lab Investigations</p></>}
                        {activeTab === 'problem' && <><IconSearch /><p>Identify DRP</p></>}
                    </div>
                )}
            </div>
            <div className="right-panel">
                <div className="tab-nav">
                    <button className={`tab-nav-button ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>Chat</button>
                    <button className={`tab-nav-button ${activeTab === 'exam' ? 'active' : ''}`} onClick={() => setActiveTab('exam')}>Exam</button>
                    <button className={`tab-nav-button ${activeTab === 'labs' ? 'active' : ''}`} onClick={() => setActiveTab('labs')}>Labs</button>
                    <button className={`tab-nav-button ${activeTab === 'problem' ? 'active' : ''}`} onClick={() => setActiveTab('problem')}>Identify DRP</button>
                </div>

                {activeTab === 'chat' && (
                    <div className="panel chat-panel">
                        <div className="panel-header">
                            <h3>Chat with Patient</h3>
                            <button className="button button-outline hint-button" onClick={handleRequestHint} disabled={isGeneratingHint || hintCount <= 0}>
                                <IconLightbulb/>
                                <span>Hint ({hintCount})</span>
                                {isGeneratingHint && <div className="loading-spinner-inline"></div>}
                            </button>
                        </div>
                        <div className="panel-content">
                             <ChatWindow 
                                chat={chat} messages={messages} setMessages={setMessages}
                                setLatestPatientMessage={setLatestPatientMessage}
                                profile={profile} currentCase={currentCase}
                            />
                        </div>
                    </div>
                )}
                {activeTab === 'exam' && <PhysicalExamPanel physicalExamString={currentCase.physicalExam} />}
                {activeTab === 'labs' && <LabsPanel orderedInvestigations={orderedInvestigations} onOrderInvestigation={handleOrderInvestigation} labResultsString={currentCase.labResults} />}
                {activeTab === 'problem' && <ProblemIdentificationPanel onFinish={handleFinishCase} isFinishing={isFinishing} />}
            </div>
        </main>
    );
};

const AVATAR_MAP: Record<string, React.FC<{ className?: string }>> = {
    'child-male': IconAvatarChildMale,
    'child-female': IconAvatarChildFemale,
    'adult-male': IconAvatarAdultMale,
    'adult-female': IconAvatarAdultFemale,
    'elderly-male': IconAvatarElderlyMale,
    'elderly-female': IconAvatarElderlyFemale,
};

const PatientVisualizer = React.memo(({ latestPatientMessage }: { latestPatientMessage: string | null }) => {
    const { patientAvatar } = useAppContext();
    const [isSpeaking, setIsSpeaking] = useState(false);
    const audioUrlRef = useRef<string | null>(null);
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        let isMounted = true;

        const playAudio = async () => {
            // --- Interrupt Handling & Cleanup ---
            if (audioRef.current && !audioRef.current.paused) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
                audioUrlRef.current = null;
            }
            
            // A null/empty message or special "thinking" keyword should stop speech.
            if (!latestPatientMessage || latestPatientMessage === 'thinking') {
                setIsSpeaking(false);
                return;
            }

            // --- TTS Generation ---
            const newAudioUrl = await getElevenLabsAudio(latestPatientMessage, patientAvatar.gender);
            
            if (!isMounted) { // Cleanup if component unmounts during fetch
                if (newAudioUrl) URL.revokeObjectURL(newAudioUrl);
                return;
            }

            if (!newAudioUrl) { // Handle TTS failure
                console.error("TTS audio generation failed. Avatar will not speak.");
                setIsSpeaking(false);
                return;
            }

            audioUrlRef.current = newAudioUrl;

            // --- Playback Logic ---
            if (audioRef.current) {
                audioRef.current.src = audioUrlRef.current;
                setIsSpeaking(true); 
                audioRef.current.play().catch(e => {
                    console.error("Audio play() failed:", e);
                    setIsSpeaking(false); 
                });
            }
        };
        
        playAudio();

        return () => { isMounted = false; };
    }, [latestPatientMessage, patientAvatar.gender]);

    const AvatarComponent = patientAvatar.avatarIdentifier ? (AVATAR_MAP[patientAvatar.avatarIdentifier] || IconPatient) : IconPatient;

    return (
        <div className="patient-visualizer">
            <div className={`patient-avatar-icon-container ${isSpeaking ? 'speaking' : ''}`}>
                 <AvatarComponent className="patient-avatar-icon" />
            </div>
            <p className="patient-name-plate">{useAppContext().currentCase?.patientProfile.name}</p>
             <audio
                ref={audioRef}
                onEnded={() => setIsSpeaking(false)}
                onError={(e) => {
                    console.error("Audio playback error.", e);
                    setIsSpeaking(false);
                }}
                hidden
            />
        </div>
    );
});

const StepwiseReasoningDisplay = ({ reasoning }: { reasoning: string }) => {
    const steps = useMemo(() => {
        // This function cleans up each line to remove common markdown-like artifacts.
        const cleanLine = (line: string): string => {
            return line
                .trim()
                // Remove list markers like "1.", "* ", "- "
                .replace(/^[\d\.\*\-\s]+/, '')
                // Remove bold/italic markers like **text** or *text*
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/\*(.*?)\*/g, '$1');
        };

        return reasoning
            .split('\n')
            .map(cleanLine) // Use the new cleanup function
            .filter(line => line.length > 0);
    }, [reasoning]);

    if (steps.length === 0) {
        // Still apply cleaning to the full block if it's not a list
        return <div className="debrief-text">{reasoning.split('\n').map(line => line.trim()).join('\n')}</div>;
    }

    return (
        <div className="stepwise-reasoning-timeline">
            {steps.map((step, index) => (
                <div key={index} className="reasoning-step">
                    <div className="reasoning-step-number">{index + 1}</div>
                    <div className="reasoning-step-content">
                        <p>{step}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};


const DebriefPage = () => {
    const { currentCase, simulationResult, debriefData, isGeneratingDebrief, debriefError, handleGenerateDebrief, setPage } = useAppContext();
    const [activeTab, setActiveTab] = useState('feedback');
    const [selectedMcqAnswers, setSelectedMcqAnswers] = useState<Record<number, number>>({});
    
    useEffect(() => {
        if (!debriefData && !isGeneratingDebrief) {
            handleGenerateDebrief();
        }
    }, [debriefData, isGeneratingDebrief, handleGenerateDebrief]);

    if (!currentCase || !simulationResult) {
        return (
            <div className="app-container">
                <p>Loading debrief...</p>
                <button onClick={() => setPage('home')}>Return to Home</button>
            </div>
        );
    }
    
    const { problemCorrect, timeTaken, selectedProblem } = simulationResult;
    const correctProblem = currentCase.drugRelatedProblems.find(d => d.isCorrect)?.problem || "N/A";

    const handleSelectMcqAnswer = (mcqIndex: number, optionIndex: number) => {
        if (selectedMcqAnswers[mcqIndex] === undefined) {
            setSelectedMcqAnswers(prev => ({ ...prev, [mcqIndex]: optionIndex }));
        }
    };
    
    return (
        <main className="app-container debrief-page">
            <div className={`result-banner ${problemCorrect ? 'correct' : 'incorrect'}`}>
                {problemCorrect ? <IconCheckCircle /> : <IconXCircle />}
                <div className="result-banner-text">
                    <h2>Problem Identification {problemCorrect ? 'Correct' : 'Incorrect'}</h2>
                    <p>The correct DRP was: <strong>{correctProblem}</strong></p>
                </div>
            </div>

            <div className="performance-metrics">
                <div className="metric-card">
                    <h3>Accuracy</h3>
                    <p>{problemCorrect ? '100%' : '0%'}</p>
                </div>
                <div className="metric-card">
                    <h3>Time Taken</h3>
                    <p>{formatTime(timeTaken)}</p>
                </div>
                <div className="metric-card">
                    <h3>Current Streak</h3>
                    <p>1 <IconFire /></p>
                </div>
            </div>

            <div className="debrief-content">
                 <div className="tab-nav">
                    <button className={`tab-nav-button ${activeTab === 'feedback' ? 'active' : ''}`} onClick={() => setActiveTab('feedback')}>Feedback</button>
                    <button className={`tab-nav-button ${activeTab === 'review' ? 'active' : ''}`} onClick={() => setActiveTab('review')}>Review</button>
                    <button className={`tab-nav-button ${activeTab === 'questions' ? 'active' : ''}`} onClick={() => setActiveTab('questions')}>Questions</button>
                </div>
                
                <div className="tab-content-panel">
                    {isGeneratingDebrief && <div className="panel-loader"><div className="loading-spinner"></div><p>Generating Feedback...</p></div>}
                    {debriefError && <div className="info-box">{debriefError}</div>}
                    
                    {debriefData && activeTab === 'feedback' && (
                        <div>
                            <AccordionSection title="Stepwise Reasoning" defaultOpen={true}>
                                <StepwiseReasoningDisplay reasoning={debriefData.stepwiseReasoning} />
                            </AccordionSection>
                            <AccordionSection title="Learning Pearls" defaultOpen={true}>
                                <div className="learning-pearls-grid">
                                    {debriefData.learningPearls.map((pearl, i) => (
                                        <div key={i} className="pearl-card">
                                            <div className="pearl-card-icon">
                                                <IconLightbulb />
                                            </div>
                                            <p>{pearl}</p>
                                        </div>
                                    ))}
                                </div>
                            </AccordionSection>
                             <AccordionSection title="Further Reading" defaultOpen={true}>
                                {debriefData.citations && debriefData.citations.length > 0 ? (
                                    <ul className="citations-list">
                                        {debriefData.citations.map((citation, i) => (
                                            <li key={i}>
                                                <div className="citation-icon"><IconBook /></div>
                                                <span>{citation}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>No citations available for this case.</p>
                                )}
                            </AccordionSection>
                        </div>
                    )}
                    
                    {activeTab === 'review' && (
                        <div>
                            <AccordionSection title="Problem Review" defaultOpen={true}>
                                <div className="choice-options">
                                    {currentCase.drugRelatedProblems.map(({ problem, isCorrect }) => (
                                        <div key={problem} className={`choice-option revealed ${isCorrect ? 'correct' : ''} ${selectedProblem === problem && !isCorrect ? 'incorrect' : ''}`}>
                                            {isCorrect ? <IconCheck /> : (selectedProblem === problem ? <IconX /> : <div className="choice-option-icon-placeholder"/>)}
                                            <span className="diagnosis-text">{problem}</span>
                                            {selectedProblem === problem && <span className="your-pick-badge">Your Pick</span>}
                                        </div>
                                    ))}
                                </div>
                            </AccordionSection>
                        </div>
                    )}
                    
                    {activeTab === 'questions' && (
                        <div>
                           <AccordionSection title="Post-Case Questions" defaultOpen={true}>
                            {currentCase.mcqs.length > 0 ? currentCase.mcqs.map((mcq, index) => {
                                const isRevealed = selectedMcqAnswers[index] !== undefined;
                                return(
                                <div key={index} className="mcq-item">
                                    <p><strong>{index + 1}. {mcq.question}</strong></p>
                                    <div className="choice-options">
                                        {mcq.options.map((option, optionIndex) => {
                                            const isSelected = selectedMcqAnswers[index] === optionIndex;
                                            const isCorrect = mcq.correctAnswerIndex === optionIndex;
                                            return (
                                                <button key={optionIndex}
                                                    className={`choice-option ${isRevealed && isCorrect ? 'correct' : ''} ${isRevealed && isSelected && !isCorrect ? 'incorrect' : ''}`}
                                                    onClick={() => handleSelectMcqAnswer(index, optionIndex)} disabled={isRevealed}>
                                                    {isRevealed && (isCorrect || isSelected) && (isCorrect ? <IconCheck/> : <IconX className="choice-option-icon"/>)}
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {isRevealed && (
                                        <div className="explanation-box">
                                            <h4>Explanation</h4>
                                            <p>{mcq.explanation}</p>
                                        </div>
                                    )}
                                </div>
                            )}) : <p>No clinical questions for this case.</p>}
                        </AccordionSection>
                        </div>
                    )}
                </div>
            </div>

            <div className="debrief-footer">
                <button className="button button-outline"><IconDownload /> Download Report</button>
                <button className="button button-primary" onClick={() => setPage('home')}>Return to Dashboard</button>
            </div>
        </main>
    );
};


const App = () => {
    const { session, page, isGenerating, generationError, isAuthLoading, authError, isMobileMenuOpen, setIsMobileMenuOpen } = useAppContext();

    if (isAuthLoading && page !== 'callback') {
        return (
             <div className="splash-overlay">
                <div className="splash-content">
                    <div className="loading-spinner"></div>
                    <h2>MedAnna</h2>
                    <p>Loading your session...</p>
                </div>
            </div>
        );
    }

    if (page === 'callback') {
        return <AuthCallbackPage />;
    }

    if (authError) {
         return (
             <div className="splash-overlay">
                <div className="splash-content">
                    <IconAlertTriangle className="alert-icon"/>
                    <h2>Error</h2>
                    <p>{authError}</p>
                    <button className="button" onClick={() => window.location.reload()}>Try Again</button>
                </div>
            </div>
        );
    }

    const renderPage = () => {
        if (!session) return <AuthPage />;

        switch (page) {
            case 'simulation': return <SimulationPage />;
            case 'debrief': return <DebriefPage />;
            case 'home':
            default:
                return <HomePage />;
        }
    };

    return (
        <>
            <AppHeader />
            {renderPage()}
            {isGenerating && <GeneratingCaseSplash />}
            {generationError && (
                 <ExplanationModal title="Generation Error" onClose={() => { /* This should be handled in context */ }} icon={<IconAlertTriangle/>}>
                    {generationError}
                 </ExplanationModal>
            )}
            {isMobileMenuOpen && <MobileProfileMenu onClose={() => setIsMobileMenuOpen(false)} />}
        </>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(
    <StrictMode>
        <AppContextProvider>
            <App />
        </AppContextProvider>
    </StrictMode>
);