const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Question, Interview } = require('./models');

let genAI = null;

const checkpointBlueprint = {
    'java': [
        { range: [1, 10], subtopic: 'Bedrock Syntax & Logic', difficulty: 'Absolute Beginner' },
        { range: [11, 25], subtopic: 'OOP Basics & Methods', difficulty: 'Beginner' },
        { range: [26, 40], subtopic: 'Advanced OOP & Interfaces', difficulty: 'Intermediate' },
        { range: [41, 55], subtopic: 'Memory, GC & Constructors', difficulty: 'Intermediate' },
        { range: [56, 70], subtopic: 'Exception Handling Protocol', difficulty: 'Advanced' },
        { range: [71, 85], subtopic: 'Collections Framework Mastery', difficulty: 'Advanced' },
        { range: [86, 100], subtopic: 'Java 8 & Data Structures', difficulty: 'Expert' }
    ],
    'selenium': [
        { range: [1, 15], subtopic: 'Locators (ID, Name, ClassName, LinkText)', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'XPath & CSS Selector Strategies', difficulty: 'Intermediate' },
        { range: [36, 55], subtopic: 'Synchronization & Waits (Implicit, Explicit)', difficulty: 'Intermediate' },
        { range: [56, 75], subtopic: 'Interacting with Elements (Alerts, Frames, Windows)', difficulty: 'Advanced' },
        { range: [76, 100], subtopic: 'POM (Page Object Model) Implementation', difficulty: 'Specialist' }
    ],
    'sql': [
        { range: [1, 15], subtopic: 'DDL/DML bedrock fundamentals', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'Keys, Constraints & Filters', difficulty: 'Beginner' },
        { range: [36, 60], subtopic: 'Complex Relational Joins', difficulty: 'Intermediate' },
        { range: [61, 80], subtopic: 'Subqueries & Nth Salary logic', difficulty: 'Advanced' },
        { range: [81, 100], subtopic: 'JDBC & Transaction Protocols', difficulty: 'Expert' }
    ],
    'functional': [
        { range: [1, 25], subtopic: 'SDLC/STLC Lifecycle models', difficulty: 'Beginner' },
        { range: [26, 50], subtopic: 'Testing Types & Levels', difficulty: 'Intermediate' },
        { range: [51, 75], subtopic: 'Defect Management Lifecycle', difficulty: 'Advanced' },
        { range: [76, 100], subtopic: 'UAT & Agile Methodologies', difficulty: 'Expert' }
    ],
    'testng': [
        { range: [1, 20], subtopic: 'Annotations and priority systems', difficulty: 'Beginner' },
        { range: [21, 40], subtopic: 'Assertions & Grouping XML', difficulty: 'Intermediate' },
        { range: [41, 60], subtopic: 'Parallelism & DataProviders', difficulty: 'Advanced' }
    ],
    'poi': [
        { range: [1, 25], subtopic: 'Workbook and Sheet operations', difficulty: 'Intermediate' },
        { range: [26, 50], subtopic: 'Data-Driven Framework logic', difficulty: 'Advanced' }
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

                    let dynamicFeedback = `Acknowledged. Moving on with ${currentTopicBudget.name}...`;
                    if (qCount > 2) {
                        try {
                            const feedbackPrompt = `
                                System: Technical Interview Evaluator for ${currentTopicBudget.name}.
                                TASK: Critically evaluate the Candidate's latest answer.
                                CONTEXT:
                                Q: ${lastInteraction.question}
                                A: ${lastInteraction.answer || '[ NO RESPONSE ]'}
                                CONSTRAINT: Provide STRICTLY 1 LINE of technical feedback. Direct and pinpoint accurate. STRICTLY NO ARCHITECTURE (no talk of WebDriver internal components, hierarchy, or protocols).
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
    const canAskCode = codeCount < 2;
    const lastInteraction = interview.history[interview.history.length - 1];

    const prompt = `
        ${context}
        Current Session Status: Question #${qCount} out of ${interview.totalQuestions}.
        Full Session Transcript: ${JSON.stringify(interview.history)}
        
        LATEST INTERACTION FOR IMMEDIATE EVALUATION:
        Interviewer: ${lastInteraction.question}
        Candidate: ${lastInteraction.answer || '[ NO RESPONSE PROVIDED ]'}

        TASK:
        1. PINPOINT EVALUATION: In the "feedback" field, provide a direct, critical response to the Candidate's LATEST answer (1 line). 
        - STICK TO THE TOPIC: Focus only on relevant technical accuracy. STRICTLY NO ARCHITECTURE talk.
        - UNIQUENESS: Ensure feedback is unique and directly addresses the specific technical gap.
        2. ASK THE NEXT QUESTION: Generate a unique, challenging technical follow-up.

        CONSTRAINTS:
        - "feedback": STRICTLY 1 LINE.
        - "question": 1-3 LINES maximum. UNIQUE: Do not repeat concepts from: ${JSON.stringify(allUsedQuestions.slice(-15))}.
        - QUESTION TYPE: ${canAskCode ? 'Theoretical or Practical Code Writing (Java ONLY, max 2 total)' : '理论 Theoretical ONLY'}.
        - LANGUAGE GUARD: If isCodeRequired is true, the question MUST strictly involve Java code. NEVER use Python.
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "Direct evaluation"}
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
        const blueprint = checkpointBlueprint[topic] || checkpointBlueprint['java'];
        const checkpoint = blueprint.find(c => qCount >= c.range[0] && qCount <= c.range[1]) || { subtopic: topic, difficulty: 'Intermediate' };

        const codeCount = interview.history.filter(h => h.isCodeRequired).length;
        const canAskCode = codeCount < 2;
        const lastInteraction = interview.history[interview.history.length - 1];

        const prompt = `
        System: High-Precision Technical Interviewer for ${topic}.
        Sub-topic Target: ${checkpoint.subtopic}.
        
        LATEST INTERACTION FOR INDEPTH EVALUATION:
        Q: ${lastInteraction.question}
        A: ${lastInteraction.answer || '[ NO RESPONSE ]'}

        TASK:
        1. PINPOINT FEEDBACK: In the "feedback" field, critically evaluate the A (Answer) above (1 line). STICK TO THE SYLLABUS target: ${checkpoint.subtopic}.
        2. UNIQUE NEXT Q: Generate a new question for ${checkpoint.subtopic}. NO CONCEPTUAL REPEATS of: ${JSON.stringify(allUsedQuestions.slice(-15))}.
        
        RULES:
        - FEEDBACK: STRICTLY 1 LINE. Direct and unique.
        - QUESTION: Max 3 lines. ${canAskCode ? 'Code writing allowed (STRICTLY Java ONLY, total limit 2).' : 'THEORETICAL only.'}
        - LANGUAGE GUARD: Any code provided or requested MUST be in Java. ABSOLUTELY NO PYTHON.
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "Specific technical critique."}
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
