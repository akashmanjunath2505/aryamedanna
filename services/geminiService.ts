/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type, Chat } from "@google/genai";

export type { Chat };

// --- TYPE DEFINITIONS (mirror from index.tsx) ---
export type PharmacyArea = 'Community Pharmacy' | 'Hospital Pharmacy' | 'Clinical Pharmacy' | 'Industrial Pharmacy';
export type TrainingPhase = 'B.Pharm Year 1' | 'B.Pharm Year 2' | 'B.Pharm Year 3' | 'B.Pharm Year 4';
export type CognitiveSkill = 'Recall' | 'Application' | 'Analysis';
export type EPA = 'History-taking' | 'Patient Counseling' | 'Intervention' | 'Documentation';

interface DrugRelatedProblem {
    problem: string;
    isCorrect: boolean;
}

interface ChatMessage {
    sender: 'user' | 'patient' | 'system';
    text: string;
    timestamp: string;
}

export interface MCQ {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
}

export interface CurriculumTags {
    framework: 'PCI/B.Pharm';
    competency: string;
}

export interface CaseTags {
    trainingPhase: TrainingPhase;
    specialty: PharmacyArea;
    cognitiveSkill: CognitiveSkill;
    epas: EPA[];
    curriculum: CurriculumTags;
}

// FIX: Completed the PharmacyCase interface which was truncated in the original file.
export interface PharmacyCase {
    title: string;
    patientProfile: {
        name: string;
        age: number;
        gender: 'Male' | 'Female' | 'Other';
        ethnicity: 'Asian' | 'Black' | 'Caucasian' | 'Hispanic' | 'Middle Eastern' | 'South Asian' | 'Other';
    };
    chiefComplaint: string;
    historyOfPresentIllness: string;
    medicationHistory: string;
    physicalExam: string;
    labResults: string;
    drugRelatedProblems: DrugRelatedProblem[];
    mcqs: MCQ[];
    tags: CaseTags;
}

// FIX: Added missing GenerationFilters interface.
export interface GenerationFilters {
    trainingPhase: TrainingPhase;
    specialties: PharmacyArea[];
    subSpecialties?: string[];
    epas?: EPA[];
    challengeMode?: boolean;
}

// FIX: Added missing DebriefData interface.
export interface DebriefData {
    reasoning: string;
    learningPearls: string[];
    citations: string[];
}


// --- GEMINI API SETUP ---
const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- HELPER FUNCTIONS ---
const safeJSONParse = <T>(jsonString: string, fallback: T): T => {
    try {
        const cleanedString = jsonString.replace(/```json\n?|```/g, '').trim();
        return JSON.parse(cleanedString) as T;
    } catch (e) {
        console.error("Failed to parse JSON:", e, "Raw string:", jsonString);
        return fallback;
    }
};

// --- API FUNCTIONS ---

// FIX: Added missing generateCase function implementation.
export const generateCase = async (filters: GenerationFilters): Promise<PharmacyCase> => {
    const specialties = filters.specialties?.length ? filters.specialties.join(', ') : 'any relevant pharmacy area';
    const subSpecialties = filters.subSpecialties?.length ? `Focus on these specific topics: ${filters.subSpecialties.join(', ')}.` : '';
    const epas = filters.epas?.length ? `The case must allow the student to practice these EPAs: ${filters.epas.join(', ')}.` : '';

    const prompt = `
        Generate a detailed clinical pharmacy case study for a student in the '${filters.trainingPhase}' of their B.Pharm program.
        The case should be relevant to ${specialties}.
        ${subSpecialties}
        ${epas}
        The case must be appropriate for the student's training level, with complexity adjusted accordingly.
        If challengeMode is on, create a complex, interdisciplinary case. Challenge Mode: ${filters.challengeMode ? 'ON' : 'OFF'}.
        
        The case must include:
        1. A patient profile (name, age, gender, ethnicity).
        2. A chief complaint.
        3. History of present illness.
        4. Medication history.
        5. Physical exam findings.
        6. Relevant lab results (can include normal and abnormal values).
        7. A list of 4 plausible drug-related problems (DRPs), with only ONE being the correct primary DRP.
        8. 2-3 multiple-choice questions (MCQs) related to the case, with 4 options each, a correct answer index, and a brief explanation.
        9. Tags for training phase, specialty, cognitive skill (Recall, Application, or Analysis), and EPAs.
        10. A curriculum tag with a competency from the PCI/B.Pharm framework.

        Return the entire case as a single JSON object.
    `;

    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            patientProfile: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    age: { type: Type.INTEGER },
                    gender: { type: Type.STRING },
                    ethnicity: { type: Type.STRING },
                },
                required: ['name', 'age', 'gender', 'ethnicity']
            },
            chiefComplaint: { type: Type.STRING },
            historyOfPresentIllness: { type: Type.STRING },
            medicationHistory: { type: Type.STRING },
            physicalExam: { type: Type.STRING },
            labResults: { type: Type.STRING },
            drugRelatedProblems: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        problem: { type: Type.STRING },
                        isCorrect: { type: Type.BOOLEAN },
                    },
                    required: ['problem', 'isCorrect']
                }
            },
            mcqs: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctAnswerIndex: { type: Type.INTEGER },
                        explanation: { type: Type.STRING },
                    },
                    required: ['question', 'options', 'correctAnswerIndex', 'explanation']
                }
            },
            tags: {
                type: Type.OBJECT,
                properties: {
                    trainingPhase: { type: Type.STRING },
                    specialty: { type: Type.STRING },
                    cognitiveSkill: { type: Type.STRING },
                    epas: { type: Type.ARRAY, items: { type: Type.STRING } },
                    curriculum: {
                        type: Type.OBJECT,
                        properties: {
                            framework: { type: Type.STRING },
                            competency: { type: Type.STRING },
                        },
                        required: ['framework', 'competency']
                    }
                },
                required: ['trainingPhase', 'specialty', 'cognitiveSkill', 'epas', 'curriculum']
            },
        },
        required: ['title', 'patientProfile', 'chiefComplaint', 'historyOfPresentIllness', 'medicationHistory', 'physicalExam', 'labResults', 'drugRelatedProblems', 'mcqs', 'tags']
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
        }
    });

    return safeJSONParse<PharmacyCase>(response.text, {} as PharmacyCase);
};

// FIX: Added missing createChatForCase function implementation.
export const createChatForCase = (pharmacyCase: PharmacyCase): Chat => {
    const { patientProfile, historyOfPresentIllness, medicationHistory } = pharmacyCase;
    const systemInstruction = `
        You are roleplaying as ${patientProfile.name}, a ${patientProfile.age}-year-old ${patientProfile.gender}.
        Your medical background is as follows:
        - History of Present Illness: ${historyOfPresentIllness}
        - Medication History: ${medicationHistory}
        
        You should respond to the pharmacy student's questions from the patient's perspective.
        - Behave like a real patient. You may not know complex medical terms.
        - You can be a bit vague or unsure about details unless the student asks specific, clarifying questions.
        - Do not provide medical analysis or step outside of your role as the patient.
        - Keep your responses concise and natural.
    `;

    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: systemInstruction,
        },
    });

    return chat;
};

// FIX: Added missing generateHint function implementation.
export const generateHint = async (pharmacyCase: PharmacyCase, messages: ChatMessage[]): Promise<string> => {
    const chatHistory = messages
        .filter(m => m.sender !== 'system')
        .map(m => `${m.sender}: ${m.text}`)
        .join('\n');

    const prompt = `
        A pharmacy student is working on the following case:
        Case Title: ${pharmacyCase.title}
        Chief Complaint: ${pharmacyCase.chiefComplaint}
        Correct DRP: ${pharmacyCase.drugRelatedProblems.find(p => p.isCorrect)?.problem}

        Here is the conversation so far:
        ${chatHistory}

        Based on the case and the conversation, provide a subtle, Socratic hint to guide the student.
        Do not give away the answer. Instead, ask a question that encourages them to think about a specific area they might be missing.
        The hint should be phrased as a helpful suggestion or a question from a supervising pharmacist.
        Keep the hint to one or two sentences.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    return response.text;
};

// FIX: Added missing pickPharmacyAreaForCase function implementation.
export const pickPharmacyAreaForCase = async (trainingPhase: TrainingPhase): Promise<PharmacyArea> => {
    const prompt = `
        A pharmacy student in the '${trainingPhase}' level needs a random case.
        Pick ONE of the following pharmacy areas that would be most appropriate for their level:
        - Community Pharmacy
        - Hospital Pharmacy
        - Clinical Pharmacy
        - Industrial Pharmacy

        Only return the name of the pharmacy area, and nothing else.
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    const textResponse = response.text.trim();
    const validAreas: PharmacyArea[] = ['Community Pharmacy', 'Hospital Pharmacy', 'Clinical Pharmacy', 'Industrial Pharmacy'];
    if (validAreas.includes(textResponse as PharmacyArea)) {
        return textResponse as PharmacyArea;
    }
    return 'Community Pharmacy';
};

// FIX: Added missing pickBestAvatar function implementation.
export const pickBestAvatar = async (patientProfile: PharmacyCase['patientProfile']): Promise<{ avatarIdentifier: string, gender: 'Male' | 'Female' }> => {
    const { age, gender } = patientProfile;
    
    let ageGroup: 'child' | 'adult' | 'elderly';
    if (age < 18) {
        ageGroup = 'child';
    } else if (age >= 65) {
        ageGroup = 'elderly';
    } else {
        ageGroup = 'adult';
    }
    
    const genderLower = gender.toLowerCase();
    
    if (genderLower.startsWith('f')) {
        return Promise.resolve({ avatarIdentifier: `${ageGroup}-female`, gender: 'Female' });
    }
    
    return Promise.resolve({ avatarIdentifier: `${ageGroup}-male`, gender: 'Male' });
};

// FIX: Added missing generateDebrief function implementation.
export const generateDebrief = async (pharmacyCase: PharmacyCase, selectedProblem: string): Promise<DebriefData> => {
    const correctProblem = pharmacyCase.drugRelatedProblems.find(d => d.isCorrect)?.problem;
    const isCorrect = selectedProblem === correctProblem;

    const prompt = `
        A pharmacy student completed a case study.
        Case Title: ${pharmacyCase.title}
        Student's selected Drug-Related Problem (DRP): "${selectedProblem}"
        Correct DRP: "${correctProblem}"
        The student was ${isCorrect ? 'correct' : 'incorrect'}.

        Provide a debrief for the student in JSON format. The JSON object should contain:
        1. "reasoning": A detailed explanation of why the correct DRP is the right answer and why the student's choice was right or wrong.
        2. "learningPearls": An array of 3-4 key takeaway clinical pearls from this case.
        3. "citations": An array of 1-2 relevant clinical guidelines or landmark trials, formatted as a string.

        Return only the JSON object.
    `;
    
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            reasoning: { type: Type.STRING },
            learningPearls: { type: Type.ARRAY, items: { type: Type.STRING } },
            citations: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ['reasoning', 'learningPearls', 'citations']
    };
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            responseSchema: responseSchema,
        }
    });

    return safeJSONParse<DebriefData>(response.text, { reasoning: 'Could not generate debrief.', learningPearls: [], citations: [] });
};

// FIX: Added missing getElevenLabsAudio function implementation.
export const getElevenLabsAudio = async (text: string, gender: 'Male' | 'Female' | null): Promise<string | null> => {
    // This is a mock function. In a real application, you would call the ElevenLabs API here.
    // For this exercise, we are returning null to prevent errors and indicate no audio is available,
    // as API keys for third-party services are not provided.
    console.warn("getElevenLabsAudio is a mock. No audio will be played.");
    return Promise.resolve(null);
};
