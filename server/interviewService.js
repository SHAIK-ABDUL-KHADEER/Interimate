const { GoogleGenerativeAI } = require("@google/generative-ai");
const { Question } = require('./models');

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
        { range: [1, 15], subtopic: 'Architecture & ID/XPath Basics', difficulty: 'Absolute Beginner' },
        { range: [16, 35], subtopic: 'Dynamic XPath & CSS Selectors', difficulty: 'Intermediate' },
        { range: [36, 55], subtopic: 'Synchronization & Logic Waits', difficulty: 'Intermediate' },
        { range: [56, 75], subtopic: 'Actions, JSExecutor & Shadow DOM', difficulty: 'Advanced' },
        { range: [76, 100], subtopic: 'POM and Page Factory frameworks', difficulty: 'Expert' }
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
    let context = "";

    // Topic Caching Logic (DB Backed)
    if (interview.type === 'topic') {
        try {
            const topics = interview.topics;

            // 1. Calculate budgets per topic
            const n = topics.length;
            let totalTechQuestions = 15; // Floor for 1-3 topics
            if (n === 4) totalTechQuestions = 20;
            else if (n === 5) totalTechQuestions = 25;
            else if (n >= 6) totalTechQuestions = 30;

            const n_for_distribution = n;
            let budgets = [];

            const basePerTopic = Math.floor(totalTechQuestions / n_for_distribution);
            let remaining = totalTechQuestions % n_for_distribution;

            for (let i = 0; i < n_for_distribution; i++) {
                let t = basePerTopic + (remaining > 0 ? 1 : 0);
                remaining--;
                // Rule: 2 cached per 5 questions (40% ratio)
                let c = Math.floor(t * 0.4);
                if (c === 0 && t >= 3) c = 1; // Minimum 1 cached if topic has at least 3 questions
                budgets.push({ name: topics[i], total: t, cached: c, new: t - c });
            }

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

            // Adjust qCount for technical question index (tech questions start at qCount 2)
            const techQCount = qCount - 1;
            if (techQCount > totalTechQuestions) return null; // Should be handled by server, but safety first.

            // 2. Determine current topic and mode
            let currentTopic = null, cumulativeTotal = 0, relativeIdx = 0;
            for (const b of budgets) {
                if (techQCount <= cumulativeTotal + b.total) {
                    currentTopic = b;
                    relativeIdx = techQCount - cumulativeTotal;
                    break;
                }
                cumulativeTotal += b.total;
            }

            // 3. Mode decision: DB Cache check
            const topicCache = await Question.find({ category: currentTopic.name, type: 'interview_cache' });

            if (relativeIdx <= currentTopic.cached && topicCache.length > 0) {
                const randomIndex = Math.floor(Math.random() * topicCache.length);
                const cachedQ = topicCache[randomIndex].data;
                return {
                    ...cachedQ,
                    feedback: qCount === 1 ? `Ready for ${currentTopic.name}. Let's begin.` : `Acknowledged. Moving on with ${currentTopic.name}...`
                };
            }

            // Escalation to Gemini
            const result = await generateTopicQuestionWithGemini(interview, currentTopic.name, qCount, model);

            // Save to DB Cache for future sessions
            if (result && result.question) {
                await Question.create({
                    category: currentTopic.name,
                    type: 'interview_cache',
                    id: Date.now(), // Use timestamp for unique id in cache
                    data: { question: result.question, isCodeRequired: result.isCodeRequired }
                });

                // Trim cache if > 50
                const count = await Question.countDocuments({ category: currentTopic.name, type: 'interview_cache' });
                if (count > 50) {
                    const oldest = await Question.findOne({ category: currentTopic.name, type: 'interview_cache' }).sort({ createdAt: 1 });
                    if (oldest) await Question.findByIdAndDelete(oldest._id);
                }
            }
            return result;
        } catch (err) {
            console.error("[InterviewService] DB Cache Error:", err.message);
        }
    }

    // Fallback for Resume-based or Cache failures
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

    const prompt = `
        ${context}
        Current Session Status: Question #${qCount} out of 10.
        History of Q&A: ${JSON.stringify(interview.history)}

        Task: Ask the NEXT relevant technical question. 
        - If previous answers were given, briefly acknowledge them in the "feedback" field but keep it strictly technical.
        
        CRITICAL: DO NOT include the interviewer's feedback or acknowledgement in the "question" field. The "question" field must contain ONLY the technical question itself.
        CRITICAL: The technical question MUST be concise and limited to exactly 1-3 sentences (maximum 3 lines).
        
        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "feedback on previous answer"}
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

async function generateTopicQuestionWithGemini(interview, topic, qCount, model) {
    const blueprint = checkpointBlueprint[topic] || [];
    const checkpoint = blueprint.find(c => qCount >= c.range[0] && qCount <= c.range[1]) || { subtopic: topic, difficulty: 'Intermediate' };

    const prompt = `
        System: You are a high-precision Technical Interviewer. 
        Focus Area: ${topic}.
        Sub-topic Target: ${checkpoint.subtopic}.
        Session Context: Question #${qCount} of ${interview.totalQuestions + 1}.
        History: ${JSON.stringify(interview.history)}

        Task: Generate a UNIQUE challenging technical question for ${topic} focusing on ${checkpoint.subtopic}.
        
        CRITICAL RULES:
        1. BREVITY: All conversational text and the question itself MUST be concise. Total limit: 3 LINES.
        2. ANTI-DUPLICATION: Do NOT repeat any concepts or wording seen in the History.
        3. CODING: If appropriate for ${checkpoint.subtopic}, ask for a code snippet or SQL query.
        4. MANDATORY CODE: Current status: ${interview.history.some(h => h.isCodeRequired) ? 'Code already asked' : 'CODE CHALLENGE REQUIRED SOON'}.
        
        JSON FORMAT ONLY:
        {"question": "str (MAX 3 LINES)", "isCodeRequired": boolean, "feedback": "Brief acknowledgment (MAX 3 LINES)."}
    `;
    const result = await model.generateContent(prompt);
    let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
    return JSON.parse(text);
}

async function generateFinalReport(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `
        You are a Senior Technical Recruiter. Evaluate this candidate based on their 10-question interview session.
        Candidate Name: ${interview.interviewerName}
        Topics/Context: ${interview.type === 'topic' ? interview.topics.join(', ') : (interview.type === 'role-resume' ? `Role: ${interview.targetRole} + Resume` : 'Resume Based')}
        Full Interview History: ${JSON.stringify(interview.history)}

        Task: Provide a detailed assessment.
        JSON FORMAT: { "strengths": ["str"], "improvements": ["str"], "score": 1-10, "summary": "str" }
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[InterviewService] Report Error:", error.message);
        throw error;
    }
}

module.exports = { getNextInterviewQuestion, generateFinalReport };
