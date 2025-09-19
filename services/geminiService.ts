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

export interface PharmacyCase {
    title: string;
    patientProfile: {
        name: string;
        age: number;
        gender: 'Male' | 'Female' | 'Other';
        ethnicity: 'Asian' | 'Black' | 'Caucasian' | 'Hispanic' | 'Middle Eastern' | 'South Asian' | 'Other';
    };
    tags: CaseTags;
    chiefComplaint: string;
    historyOfPresentIllness: string;
    medicationHistory: string;
    physicalExam: string;
    labResults: string;
    drugRelatedProblems: DrugRelatedProblem[];
    mcqs: MCQ[];
    correctProblemExplanation: string;
}

export interface GenerationFilters {
    trainingPhase: TrainingPhase;
    specialties?: PharmacyArea[];
    subSpecialties?: string[];
    epas?: EPA[];
    challengeMode?: boolean;
}

export interface DebriefData {
    stepwiseReasoning: string;
    learningPearls: string[];
    citations: string[];
}

// --- List of all possible investigations ---
const ALL_INVESTIGATIONS_LIST = [
    // Bedside
    'ECG', 'Blood Glucose', 'Urine Dipstick',
    // Basic Labs
    'CBC', 'CMP', 'ESR', 'CRP', 'TSH', 'Lipid Profile', 'LFT', 'RFT', 'ABG',
    // Advanced Labs
    'Troponin', 'BNP', 'D-dimer', 'Coagulation Profile', 'Blood Culture', 'HbA1c',
    // Imaging
    'Chest X-Ray', 'CT Head', 'CT Chest', 'CT Abdomen', 'Abdominal Ultrasound', 'Echocardiogram'
];


// --- GEMINI API SERVICE ---

function getAi(): GoogleGenAI {
    // As per the platform's execution environment, we can expect process.env.API_KEY to be available.
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        // Throw a specific error if the API key is not configured.
        throw new Error("Gemini API key not found. Please ensure the API_KEY environment variable is set.");
    }
    
    // Create a new instance for each call to ensure statelessness.
    return new GoogleGenAI({ apiKey });
}

const caseSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A short, descriptive title for the case (e.g., 'Counseling a Patient with Newly Diagnosed Type 2 Diabetes')." },
        patientProfile: {
            type: Type.OBJECT, properties: {
                name: { type: Type.STRING },
                age: { type: Type.INTEGER },
                gender: { type: Type.STRING, enum: ["Male", "Female", "Other"] },
                ethnicity: { type: Type.STRING, enum: ['Asian', 'Black', 'Caucasian', 'Hispanic', 'Middle Eastern', 'South Asian', 'Other'] }
            },
            required: ["name", "age", "gender", "ethnicity"],
        },
        tags: {
            type: Type.OBJECT,
            properties: {
                trainingPhase: { type: Type.STRING, enum: ['B.Pharm Year 1', 'B.Pharm Year 2', 'B.Pharm Year 3', 'B.Pharm Year 4'] },
                specialty: { type: Type.STRING, description: "The primary pharmacy practice area for this case." },
                cognitiveSkill: { type: Type.STRING, enum: ['Recall', 'Application', 'Analysis'] },
                epas: { type: Type.ARRAY, items: { type: Type.STRING, enum: ['History-taking', 'Patient Counseling', 'Intervention', 'Documentation'] } },
                curriculum: {
                    type: Type.OBJECT,
                    properties: {
                        framework: { type: Type.STRING, description: "Should be 'PCI/B.Pharm'" },
                        competency: { type: Type.STRING, description: "The specific learning outcome or competency from the B.Pharm curriculum that this case addresses." },
                    },
                    required: ["framework", "competency"],
                }
            },
            required: ["trainingPhase", "specialty", "cognitiveSkill", "epas", "curriculum"],
        },
        chiefComplaint: { type: Type.STRING },
        historyOfPresentIllness: { type: Type.STRING },
        medicationHistory: { type: Type.STRING },
        physicalExam: { type: Type.STRING, description: "A string containing the physical exam findings, formatted with sections like 'Vitals:', 'General:', 'Cardiovascular:', etc." },
        labResults: {
            type: Type.STRING,
            description: `A single string containing all lab results. Format each test on a new line. For EACH test, provide a very concise result as a short phrase or key values. The entire result string for any single test (e.g., everything after 'Chest X-Ray:') MUST be less than 100 characters. For example: 'CBC: WBC 12.5, Hgb 14.1, Plt 250'. For imaging, provide a very short summary like 'Chest X-Ray: Minor infiltrates in right lower lobe.' instead of a long, formal report. Include results for ALL of the following tests, even if normal: ${ALL_INVESTIGATIONS_LIST.join(', ')}.`
        },
        drugRelatedProblems: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    problem: { type: Type.STRING },
                    isCorrect: { type: Type.BOOLEAN },
                },
                required: ["problem", "isCorrect"],
            },
            description: "A list of 4 plausible drug-related problems (DRPs). Exactly one of them must be correct (isCorrect: true)."
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
                required: ["question", "options", "correctAnswerIndex", "explanation"],
            },
            description: "A list of 3-5 multiple-choice questions relevant to the case to test clinical knowledge."
        },
        correctProblemExplanation: { type: Type.STRING, description: "A detailed, step-by-step explanation for why the correct DRP is the right choice and the others are less likely." }
    },
    required: ["title", "patientProfile", "tags", "chiefComplaint", "historyOfPresentIllness", "medicationHistory", "physicalExam", "labResults", "drugRelatedProblems", "mcqs", "correctProblemExplanation"]
};

const debriefSchema = {
    type: Type.OBJECT,
    properties: {
        stepwiseReasoning: {
            type: Type.STRING,
            description: "Provide a detailed, step-by-step reasoning process a student should follow to arrive at the correct DRP, starting from the chief complaint and integrating patient history, exam findings, and lab results."
        },
        learningPearls: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Generate 3-4 concise, high-yield 'learning pearls' or key takeaways from this case that are relevant to pharmacy practice."
        },
        citations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Provide 2-3 citations for further reading, formatted in Vancouver style. These can be from textbooks, clinical guidelines, or major journal articles."
        }
    },
    required: ["stepwiseReasoning", "learningPearls", "citations"]
};

export async function generateCase(filters: GenerationFilters): Promise<PharmacyCase> {
    const ai = getAi();

    const { trainingPhase, specialties = [], subSpecialties = [], epas = [], challengeMode = false } = filters;

    let prompt = `You are a clinical case generator for pharmacy students in India. Your task is to create a realistic, high-quality patient simulation case tailored to the B.Pharm curriculum.

    **Case Generation Parameters:**
    *   **Training Phase:** ${trainingPhase}. The complexity, required knowledge, and patient communication style should be appropriate for this level.
    *   **Primary Pharmacy Areas:** ${specialties.join(', ') || 'Any'}. The case should focus on topics relevant to these areas.
    *   **Specific Topics/Clusters:** ${subSpecialties.join(', ') || 'Any'}. If provided, the case should revolve around these specific disease states or scenarios.
    *   **EPA Focus:** ${epas.join(', ') || 'General'}. The case should provide opportunities to practice these Entrustable Professional Activities.
    *   **Challenge Mode:** ${challengeMode ? 'Enabled. Create a complex, interdisciplinary case with potential red herrings or multiple interacting problems.' : 'Disabled. Create a straightforward case focused on the core topics.'}
    
    **Instructions:**
    1.  Create a patient profile that is culturally and demographically relevant to India.
    2.  Develop a detailed clinical narrative including chief complaint, history of present illness, and medication history.
    3.  **The 'physicalExam' field MUST be populated with a detailed string.** It should not be empty. Format the findings into sections like 'Vitals:', 'General:', 'Cardiovascular:', etc., and include relevant positive and negative findings.
    4.  Ensure the 'labResults' field is a comprehensive string that includes results for ALL required tests, following the formatting rules in the schema (e.g., concise summaries for imaging).
    5.  Define 4 plausible Drug-Related Problems (DRPs). One must be clearly correct, while the others should be common distractors.
    6.  Write 3-5 MCQs that test knowledge directly related to the case's key learning points.
    7.  Ensure the 'competency' tag reflects a specific, relevant learning outcome from the Indian B.Pharm (PCI) curriculum.
    8.  Adhere strictly to the provided JSON schema for the output.
    
    Now, generate the case based on these parameters.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: caseSchema,
        },
    });
    
    try {
        const jsonText = response.text.trim();
        const caseData = JSON.parse(jsonText);

        // Basic validation
        if (!caseData.title || !caseData.drugRelatedProblems || caseData.drugRelatedProblems.length === 0) {
            throw new Error("Generated case data is missing required fields.");
        }
        return caseData as PharmacyCase;
    } catch (e) {
        console.error("Failed to parse generated case JSON:", e);
        console.error("Raw response text:", response.text);
        throw new Error("The AI model returned an invalid case format. Please try generating the case again.");
    }
}

export async function generateHint(caseInfo: PharmacyCase, chatHistory: ChatMessage[]): Promise<string> {
    const ai = getAi();
    const historyString = chatHistory
        .map(msg => `${msg.sender === 'user' ? 'Student' : 'Patient'}: ${msg.text}`)
        .join('\n');

    const prompt = `
    You are a clinical tutor AI for a pharmacy student. The student is interacting with a virtual patient.
    The student has requested a hint. Your task is to provide a subtle, Socratic-style hint to guide them.

    **Case Context:**
    *   **Title:** ${caseInfo.title}
    *   **Chief Complaint:** "${caseInfo.chiefComplaint}"
    *   **Correct Drug-Related Problem:** ${caseInfo.drugRelatedProblems.find(d => d.isCorrect)?.problem}

    **Chat History:**
    ${historyString}

    **Instructions:**
    1.  Analyze the chat history to understand what the student has already asked and where they might be stuck.
    2.  Do NOT give away the answer directly.
    3.  Provide a guiding question or suggest an area to explore further.
    4.  Frame the hint to encourage critical thinking.
    
    Example Hints:
    *   "You've asked about their current symptoms. What about any relevant medical history that might be related?"
    *   "The patient mentioned taking their medication 'when they remember'. What specific questions could you ask to understand their adherence better?"
    *   "Have you considered asking about any over-the-counter products or herbal remedies they might be using?"

    Now, provide a hint for the student based on the current situation.
    `;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    return response.text;
}

export async function generateDebrief(caseInfo: PharmacyCase, selectedProblem: string): Promise<DebriefData> {
    const ai = getAi();
    const correctProblem = caseInfo.drugRelatedProblems.find(d => d.isCorrect)?.problem;
    const isCorrect = selectedProblem === correctProblem;

    const prompt = `You are a clinical pharmacy educator. Your task is to generate a detailed, educational debrief for a student who has just completed a virtual patient case.

    **Case Information:**
    *   **Case Title:** ${caseInfo.title}
    *   **Patient Profile:** ${caseInfo.patientProfile.name}, ${caseInfo.patientProfile.age}, ${caseInfo.patientProfile.gender}
    *   **Chief Complaint:** ${caseInfo.chiefComplaint}
    *   **Correct Drug-Related Problem (DRP):** ${correctProblem}
    *   **Student's Selected DRP:** ${selectedProblem}
    *   **Result:** ${isCorrect ? 'Correct' : 'Incorrect'}
    *   **Explanation of Correct DRP:** ${caseInfo.correctProblemExplanation}

    **Instructions:**
    Based on the case information, generate the debrief content.
    1.  **Stepwise Reasoning:** Provide a clear, logical walkthrough of how to arrive at the correct diagnosis. Start with the patient's initial presentation and connect the dots using their history, exam, and lab findings. This should be a model of good clinical reasoning.
    2.  **Learning Pearls:** Identify 3-4 key clinical pearls or takeaways from this case. These should be memorable, practical pieces of information a student can apply in the future.
    3.  **Citations:** Provide 2-3 relevant citations for further reading. These should be from reputable sources like clinical practice guidelines, major textbooks (e.g., DiPiro's), or landmark clinical trials. Format them in Vancouver style.

    Adhere strictly to the JSON schema for the output.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: debriefSchema,
        }
    });

    try {
        const jsonText = response.text.trim();
        const debriefData = JSON.parse(jsonText);
        if (!debriefData.stepwiseReasoning || !debriefData.learningPearls) {
            throw new Error("Generated debrief is missing required fields.");
        }
        return debriefData as DebriefData;
    } catch (e) {
        console.error("Failed to parse generated debrief JSON:", e);
        console.error("Raw response text:", response.text);
        throw new Error("The AI model returned an invalid debrief format.");
    }
}

export function createChatForCase(caseInfo: PharmacyCase): Chat {
    const ai = getAi();
    const systemInstruction = `You are a virtual patient simulator for training pharmacy students. Your persona is based on the following profile.
    
    **Patient Profile:**
    *   **Name:** ${caseInfo.patientProfile.name}
    *   **Age:** ${caseInfo.patientProfile.age}
    *   **Gender:** ${caseInfo.patientProfile.gender}
    *   **Chief Complaint:** "${caseInfo.chiefComplaint}"
    *   **Full History:** You have the following detailed history. Reveal this information *only* when the student asks relevant questions. Do not volunteer information they haven't asked for.
        *   **History of Present Illness:** ${caseInfo.historyOfPresentIllness}
        *   **Medication History:** ${caseInfo.medicationHistory}
        *   **Physical Exam Findings:** ${caseInfo.physicalExam}
        *   **Lab Results:** ${caseInfo.labResults}
        
    **Your Role:**
    1.  **Act as the patient.** Respond from the patient's point of view, using their language and level of health literacy. Behave consistently with your age and profile.
    2.  **Be realistic.** You don't know your diagnosis or what a "drug-related problem" is. You can only describe your symptoms and experiences.
    3.  **Answer questions naturally.** If a student asks "Tell me about your medications," respond as a patient would, e.g., "I take a small white pill for my blood pressure and another one for sugar." Don't just list the medication names unless you've been explicitly told them.
    4.  **Stay in character.** Maintain the persona of ${caseInfo.patientProfile.name} throughout the conversation.
    5.  **Be concise.** Keep your answers relatively short and to the point, unless the student asks for more detail.
    `;

    return ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.5,
            topP: 0.9,
        }
    });
}

export async function pickPharmacyAreaForCase(trainingPhase: TrainingPhase): Promise<PharmacyArea> {
    const ai = getAi();
    const yearMap: Record<TrainingPhase, string> = {
        'B.Pharm Year 1': 'focus on foundational concepts, very basic community pharmacy scenarios.',
        'B.Pharm Year 2': 'focus on core pharmacology and pharmaceutics, suitable for basic community or hospital cases.',
        'B.Pharm Year 3': 'focus on clinical, hospital, and community practice. Broader range of topics.',
        'B.Pharm Year 4': 'focus on advanced clinical topics, complex cases, and specialized areas.'
    };

    const prompt = `
    A pharmacy student is in their **${trainingPhase}**. Based on a typical B.Pharm curriculum in India, which of the following pharmacy practice areas would be most appropriate for a simulation case for them?
    *   Community Pharmacy
    *   Hospital Pharmacy
    *   Clinical Pharmacy
    *   Industrial Pharmacy

    The student's current learning should ${yearMap[trainingPhase]}.
    
    Respond with ONLY the name of the most appropriate practice area from the list above. Do not provide any explanation or other text.
    `;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
    });

    const specialty = response.text.trim() as PharmacyArea;
    const validSpecialties: PharmacyArea[] = ['Community Pharmacy', 'Hospital Pharmacy', 'Clinical Pharmacy', 'Industrial Pharmacy'];
    if (validSpecialties.includes(specialty)) {
        return specialty;
    }
    // Fallback to a sensible default if the model returns something unexpected
    return 'Community Pharmacy';
}

export async function pickBestAvatar(patientProfile: PharmacyCase['patientProfile']): Promise<{ avatarIdentifier: string; gender: 'Male' | 'Female' }> {
    const { age, gender } = patientProfile;
    
    // Simple logic first to avoid unnecessary API calls for clear cases
    if (gender !== 'Male' && gender !== 'Female') {
        // Default for 'Other' or unexpected gender values
        const randomGender = Math.random() > 0.5 ? 'Male' : 'Female';
        if (age < 18) return { avatarIdentifier: `child-${randomGender.toLowerCase()}`, gender: randomGender };
        if (age >= 65) return { avatarIdentifier: `elderly-${randomGender.toLowerCase()}`, gender: randomGender };
        return { avatarIdentifier: `adult-${randomGender.toLowerCase()}`, gender: randomGender };
    }

    const ageCategory = age < 18 ? 'child' : age >= 65 ? 'elderly' : 'adult';
    const avatarIdentifier = `${ageCategory}-${gender.toLowerCase()}`;
    return { avatarIdentifier, gender };
}


// A mock function to simulate TTS. Replace with a real TTS service.
export async function getElevenLabsAudio(text: string, gender: 'Male' | 'Female' | null): Promise<string | null> {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
        // console.warn("ElevenLabs API key not found. Text-to-speech will be disabled.");
        return null;
    }
    
    // Male: Adam (pNInz6obpgDQGcFmaJgB), Female: Rachel (21m00Tcm4TlvDq8ikWAM)
    const voiceId = gender === 'Male' ? 'pNInz6obpgDQGcFmaJgB' : '21m00Tcm4TlvDq8ikWAM';
    const modelId = 'eleven_multilingual_v2';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const headers = {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
    };

    const data = {
        text: text,
        model_id: modelId,
        voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
        },
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error('ElevenLabs API Error:', errorBody);
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const audioBlob = await response.blob();
        return URL.createObjectURL(audioBlob);

    } catch (error) {
        console.error('Error fetching TTS audio from ElevenLabs:', error);
        return null;
    }
}