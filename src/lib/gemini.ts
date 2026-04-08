import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function generateActionItems(
  meetingTitle: string,
  meetingDate: string,
  participantNames: string,
  noteContent: string,
  personName: string
) {
  const prompt = `You are analyzing meeting notes for a Product Manager.
Meeting: ${meetingTitle}
Date: ${meetingDate}
Participants: ${participantNames}

Meeting Notes:
${noteContent}

Generate a clear, concise list of action items specifically for ${personName}.
Format as a JSON array: [{ "description": "action item text" }]
Only include items directly assigned to or relevant to ${personName}.
If no action items found for this person, return an empty array.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  if (response.text) {
    try {
      return JSON.parse(response.text);
    } catch (e) {
      console.error('Failed to parse Gemini response', e);
      return [];
    }
  }
  return [];
}
