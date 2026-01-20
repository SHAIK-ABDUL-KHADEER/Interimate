const { GoogleGenerativeAI } = require("@google/generative-ai");

const topicContext = {
    'java': 'Core Java logic/syntax. Cover: Loops, arrays, strings, OOP, Collections, Exception handling.',
    'selenium': 'Selenium WebDriver in JAVA ONLY. Cover: Finding elements (ID, XPath, CSS), Actions, Sync strategies, Framework basics.',
    'sql': 'Relational SQL. Cover: DDL, DML, JOINS, Subqueries, Indexes.'
};

let genAI = null;

async function getNextInterviewQuestion(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const qCount = interview.history.length + 1;
    let context = "";

    if (interview.type === 'topic') {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} on the following topics: ${interview.topics.join(', ')}. 
        Syllabus context: ${interview.topics.map(t => topicContext[t]).join(' ')}.`;
    } else {
        context = `You are a Professional Technical Interviewer. You are interviewing ${interview.interviewerName} based on their resume. 
        Resume Content: ${interview.resumeText}`;
    }

    const prompt = `
        ${context}
        Current Session Status: Question #${qCount} out of 10.
        History of Q&A: ${JSON.stringify(interview.history)}

        Task: Ask the NEXT relevant technical question. 
        - If previous answers were given, briefly acknowledge them in the "feedback" field but keep it strictly technical.
        - Questions should be challenging and professional. 
        - If you need the user to write code, explicitly state it in the question.

        JSON FORMAT ONLY:
        {"question": "str", "isCodeRequired": boolean, "feedback": "feedback on previous answer or greeting if #1"}
        
        No markdown, no talk. Only raw JSON.
    `;

    try {
        const result = await model.generateContent(prompt);
        let text = (await result.response).text().replace(/^[^{]*/, "").replace(/[^}]*$/, "");
        return JSON.parse(text);
    } catch (error) {
        console.error("[InterviewService] Error:", error.message);
        throw error;
    }
}

async function generateFinalReport(interview) {
    if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `
        You are a Senior Technical Recruiter. Evaluate this candidate based on their 10-question interview session.
        Candidate Name: ${interview.interviewerName}
        Topics/Context: ${interview.type === 'topic' ? interview.topics.join(', ') : 'Resume Based'}
        Full Interview History: ${JSON.stringify(interview.history)}

        Task: Provide a detailed assessment.
        JSON FORMAT:
        {
          "strengths": ["point 1", "point 2"],
          "improvements": ["point 1", "point 2"],
          "score": 1-10,
          "summary": "Overall summary of performance"
        }
        
        Only raw JSON.
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
