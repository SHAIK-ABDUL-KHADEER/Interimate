const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Question, Interview } = require('./models');

let genAI = null;

const checkpointBlueprint = {
    'java': [
        'Bedrock Syntax & Logic',
        'OOP Basics & Methods',
        'Advanced OOP & Interfaces',
        'Memory, GC & Constructors',
        'Exception Handling Protocol',
        'Collections Framework Mastery',
        'Java 8 & Data Structures'
    ],
    'selenium': [
        'Locators (ID, Name, ClassName, LinkText)',
        'XPath & CSS Selector Strategies',
        'Synchronization & Waits (Implicit, Explicit)',
        'Interacting with Elements (Alerts, Frames, Windows)',
        'POM (Page Object Model) Implementation'
    ],
    'sql': [
        'DDL/DML bedrock fundamentals',
        'Keys, Constraints & Filters',
        'Complex Relational Joins',
        'Subqueries & Nth Salary logic',
        'JDBC & Transaction Protocols'
    ],
    'functional': [
        'SDLC/STLC Lifecycle models',
        'Testing Types & Levels',
        'Defect Management Lifecycle',
        'UAT & Agile Methodologies'
    ],
    'testng': [
        'Annotations and priority systems',
        'Assertions & Grouping XML',
        'Parallelism & DataProviders'
    ],
    'poi': [
        'Workbook and Sheet operations',
        'Data-Driven Framework logic'
    ]
};

async function getNextInterviewQuestion(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const qCount = interview.history.length + 1;

    // --- UNIVERSAL PROTOCOL: QUESTION #1 is ALWAYS SELF-INTRODUCTION ---
    if (qCount === 1) {
        const greetingName = interview.interviewerName || interview.username || 'Operative';
        let technicalContext = "";
        if (interview.type === 'topic') technicalContext = `your experience with ${interview.topics.join(', ')}`;
        else if (interview.type === 'role-resume') technicalContext = `your profile relative to the ${interview.targetRole} position`;
        else technicalContext = `your technical background and resume`;

        return {
            question: `Hi ${greetingName}, welcome to the interview! To begin our session, could you please introduce yourself and provide a brief overview of ${technicalContext}?`,
            isCodeRequired: false,
            feedback: "Initializing Mission Protocol: Establishing Candidate Baseline..."
        };
    }

    // --- FETCH ALL PREVIOUS HISTORY FOR UNIQUENESS ---
    const pastInterviews = await Interview.find({
        username: interview.username,
        status: 'completed',
        type: interview.type
    });

    const pastQuestions = pastInterviews.flatMap(i => i.history.map(h => h.question));
    const currentSessionQuestions = interview.history.map(h => h.question);
    const allUsedQuestions = [...new Set([...pastQuestions, ...currentSessionQuestions])];

    // Topic Caching Logic (DB Backed)
    if (interview.type === 'topic') {
        try {
            const topics = interview.topics;
            const n = topics.length;
            let totalTechQuestions = 15;
            if (n === 4) totalTechQuestions = 20;
            else if (n === 5) totalTechQuestions = 25;
            else if (n >= 6) totalTechQuestions = 30;

            let budgets = [];
            const basePerTopic = Math.floor(totalTechQuestions / n);
            let remaining = totalTechQuestions % n;

            for (let i = 0; i < n; i++) {
                let t = basePerTopic + (remaining > 0 ? 1 : 0);
                remaining--;
                let c = Math.floor(t * 0.4);
                if (c === 0 && t >= 3) c = 1;
                budgets.push({ name: topics[i], total: t, cached: c, new: t - c });
            }

            const techQCount = qCount - 1;
            if (techQCount > totalTechQuestions) return null;

            let currentTopicBudget = null, cumulativeTotal = 0, relativeIdx = 0;
            for (const b of budgets) {
                if (techQCount <= cumulativeTotal + b.total) {
                    currentTopicBudget = b;
                    relativeIdx = techQCount - cumulativeTotal;
                    break;
                }
                cumulativeTotal += b.total;
            }

            if (currentTopicBudget) {
                const topicCache = await Question.find({ category: currentTopicBudget.name, type: 'interview_cache' });

                const availableCache = topicCache.filter(q => {
                    const qText = q.data.question.toLowerCase();
                    const isAlreadyUsed = allUsedQuestions.includes(q.data.question);
                    const isInvalid = qText.includes('python') ||
                        (currentTopicBudget.name === 'selenium' && (qText.includes('architecture') || qText.includes('json wire') || qText.includes('w3c protocol')));
                    return !isAlreadyUsed && !isInvalid;
                });

                if (relativeIdx <= currentTopicBudget.cached && availableCache.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableCache.length);
                    const cachedQ = availableCache[randomIndex].data;
                    const lastInteraction = interview.history[interview.history.length - 1];

                    let dynamicFeedback = `Protocol Sync: Analyzing technical response for ${currentTopicBudget.name}...`;
                    if (qCount > 2) {
                        try {
                            const feedbackPrompt = `
                                System: Technical Interview Evaluator for ${currentTopicBudget.name}.
                                TASK: Critically evaluate the Candidate's latest answer.
                                CONTEXT:
                                Q: ${lastInteraction.question}
                                A: ${lastInteraction.answer || '[ NO RESPONSE ]'}
                                CONSTRAINT: Provide STRICTLY 1 LINE of technical feedback. Direct and pinpoint accurate. STRICTLY NO ARCHITECTURE.
                                DIFFICULTY: BASIC to INTERMEDIATE level only.
                                RESPONSE: Text only.
                            `;
                            const fbResult = await model.generateContent(feedbackPrompt);
                            dynamicFeedback = (await fbResult.response).text().trim();
                        } catch (fbErr) {
                            console.error("[InterviewService] Feedback Generation Error:", fbErr.message);
                        }
                    }

                    return {
                        ...cachedQ,
                        feedback: dynamicFeedback
                    };
                }

                // Escalation to Gemini
                const result = await generateTopicQuestionWithGemini(interview, currentTopicBudget.name, qCount, model, allUsedQuestions);

                // Save to DB Cache
                if (result && result.question) {
                    const exists = await Question.findOne({
                        category: currentTopicBudget.name,
                        type: 'interview_cache',
                        'data.question': result.question
                    });

                    if (!exists) {
                        await Question.create({
                            category: currentTopicBudget.name,
                            type: 'interview_cache',
                            id: Date.now(),
                            data: { question: result.question, isCodeRequired: result.isCodeRequired }
                        });
                        const count = await Question.countDocuments({ category: currentTopicBudget.name, type: 'interview_cache' });
                        if (count > 50) {
                            const oldest = await Question.findOne({ category: currentTopicBudget.name, type: 'interview_cache' }).sort({ createdAt: 1 });
                            if (oldest) await Question.findByIdAndDelete(oldest._id);
                        }
                    }
                }
                return result;
            }
        } catch (err) {
            console.error("[InterviewService] DB Cache Error:", err.message);
        }
    }

    // --- RESUME OR FALLBACK LOGIC ---
    let context = "";
    if (interview.type === 'role-resume') {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} for the specific role of: "${interview.targetRole}".
        Evaluation Context: You must weigh their Resume history against the requirements of the "${interview.targetRole}" position.
        Resume Content: ${interview.resumeText}`;
    } else if (interview.type === 'resume') {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} based on their resume. 
        Resume Content: ${interview.resumeText}`;
    } else {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} on topics: ${interview.topics.join(', ')}.`;
    }

    const codeCount = interview.history.filter(h => h.isCodeRequired).length;
    const techQCount = qCount - 1;
    const isCodeMilestone = (techQCount === 5 || techQCount === 9);
    const canAskCode = codeCount < 2 && isCodeMilestone;

    const lastInteraction = interview.history[interview.history.length - 1];

    const prompt = `
        ${context}
        Current Session Status: Question #${qCount} out of ${interview.totalQuestions}.
        Full Session Transcript: ${JSON.stringify(interview.history)}
        
        LATEST INTERACTION FOR IMMEDIATE EVALUATION:
        Interviewer: ${lastInteraction.question}
        Candidate: ${lastInteraction.answer || '[ NO RESPONSE PROVIDED ]'}

        TASK:
        1. PINPOINT EVALUATION: In the "feedback" field, provide a direct, critical technical evaluation (1 line). 
        - STICK TO THE TOPIC: Focus only on technical accuracy. NO ARCHITECTURE.
        - ANTI-POLITE: ABSOLUTELY NO introductory filler (e.g., "Acknowledged", "Great answer"). Start directly with the critique.
        2. ASK THE NEXT QUESTION: Generate a unique, APPROACHABLE follow-up.

        CONSTRAINTS:
        - MODE: ${canAskCode ? 'PRACTICAL JAVA CODE CHALLENGE (Intermediate).' : 'STRICT CONCEPTUAL THEORY ONLY (No code).'}
        - DIFFICULTY: BASIC to INTERMEDIATE ONLY.
        - "feedback": STRICTLY 1 LINE.
        - "question": STRICTLY LESS THAN 3 LINES. UNIQUE: Do not repeat: ${JSON.stringify(allUsedQuestions.slice(-15))}.
        - LANGUAGE GUARD: Strictly Java code only (if asked). NEVER use Python.
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": ${canAskCode}, "feedback": "Direct evaluation"}
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[InterviewService] Legacy Error:", error.message);
        throw error;
    }
}

async function generateTopicQuestionWithGemini(interview, topic, qCount, model, allUsedQuestions = []) {
    try {
        const syllabus = checkpointBlueprint[topic] || checkpointBlueprint['java'];

        const codeCount = interview.history.filter(h => h.isCodeRequired).length;
        const techQCount = qCount - 1;
        const isCodeMilestone = (techQCount === 5 || techQCount === 9);
        const canAskCode = codeCount < 2 && isCodeMilestone;

        const lastInteraction = interview.history[interview.history.length - 1];

        const prompt = `
        System: High-Precision Technical Interviewer for ${topic}.
        CORE SYLLABUS: ${syllabus.join(', ')}.
        
        LATEST INTERACTION FOR INDEPTH EVALUATION:
        Q: ${lastInteraction.question}
        A: ${lastInteraction.answer || '[ NO RESPONSE ]'}

        TASK:
        1. PINPOINT FEEDBACK: critically evaluate the A (Answer) above (1 line).
           - ANTI-POLITE: ABSOLUTELY NO filler like "Acknowledged" or "Good". Focus ONLY on technical correctness.
        2. UNIQUE NEXT Q: Generate an APPROACHABLE question from any concept in the CORE SYLLABUS above.
        
        RULES:
        - MODE: ${canAskCode ? 'PRACTICAL JAVA CODE CHALLENGE (Intermediate).' : 'STRICT CONCEPTUAL THEORY ONLY (No code).'}
        - DIFFICULTY: BASIC to INTERMEDIATE ONLY. No deep internals.
        - FEEDBACK: STRICTLY 1 LINE.
        - QUESTION: STRICTLY LESS THAN 3 LINES. NO CONCEPTUAL REPEATS of: ${JSON.stringify(allUsedQuestions.slice(-15))}.
        - LANGUAGE GUARD: Strictly Java code only (if asked). ABSOLUTELY NO PYTHON.
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": ${canAskCode}, "feedback": "Specific technical critique."}
    `;
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[InterviewService] Generation Error:", error.message);
        throw error;
    }
}

async function generateFinalReport(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `
        You are a Senior Technical Recruiter and Tech Lead. Evaluate this candidate with absolute accuracy based on their interview session.
        Topics: ${interview.topics.join(', ')}
        Transcript: ${JSON.stringify(interview.history)}

        Task: Provide assessment.
        - SCORING (1-10): Be highly critical.
        - RAG: Green (8-10), Amber (5-7), Red (1-4).
        
        JSON FORMAT ONLY:
        { "strengths": ["str"], "improvements": ["str"], "score": number, "summary": "str" }
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        const report = JSON.parse(text);

        if (report.score >= 8) report.rag = 'Green';
        else if (report.score >= 5) report.rag = 'Amber';
        else report.rag = 'Red';

        return report;
    } catch (error) {
        console.error("[InterviewService] Report Error:", error.message);
        throw error;
    }
}

module.exports = { getNextInterviewQuestion, generateFinalReport };
