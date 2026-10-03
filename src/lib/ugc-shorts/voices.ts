export interface UgcVoice {
  id: string;
  name: string;
  voiceId: string;
  gender: "male" | "female";
  style: string;
  previewText: string;
}

export const UGC_VOICES: UgcVoice[] = [
  {
    id: "adam",
    name: "Adam",
    voiceId: "pNInz6obpgDQGcFmaJgB",
    gender: "male",
    style: "Deep & Authoritative",
    previewText: "Hey, let me tell you about something that changed everything for me.",

  },
  {
    id: "antoni",
    name: "Antoni",
    voiceId: "ErXwobaYiN019PkySvjV",
    gender: "male",
    style: "Calm & Conversational",
    previewText: "So I found this product and honestly, it blew my mind.",

  },
  {
    id: "arnold",
    name: "Arnold",
    voiceId: "VR6AewLTigWG4xSOukaG",
    gender: "male",
    style: "Professional & Polished",
    previewText: "Let me walk you through why this matters for your business.",

  },
  {
    id: "bella",
    name: "Bella",
    voiceId: "EXAVITQu4vr4xnSDxMaL",
    gender: "female",
    style: "Energetic Creator",
    previewText: "Oh my gosh, you guys need to see this right now!",

  },
  {
    id: "mira",
    name: "Mira",
    voiceId: "21m00Tcm4TlvDq8ikWAM",
    gender: "female",
    style: "Calm Professional",
    previewText: "I want to share something that really impressed me this week.",

  },
  {
    id: "domi",
    name: "Domi",
    voiceId: "AZnzlk1XvdvUeBnXmlld",
    gender: "female",
    style: "Confident & Bold",
    previewText: "Listen up, because this is the best decision I ever made.",

  },
];
