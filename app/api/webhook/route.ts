import crypto from 'crypto';
import { NextResponse } from 'next/server';

// --- Configuration ---
const BOT_TOKEN = process.env.BOT_TOKEN; 
const BOT_USERNAME = process.env.BOT_USERNAME; 
const GPLINK_API_KEY = process.env.GPLINK_API_KEY;
const SECRET_KEY = Buffer.from("qW4s7yYJr5d2kOk6");

// --- Key Generator (10-minute window) ---
function generateKey() {
    const timestampWindow = Math.floor(Date.now() / 1000 / 600);
    const timeCode = String(timestampWindow % 10000).padStart(4, '0');

    const hmac = crypto.createHmac('sha256', SECRET_KEY);
    hmac.update(timeCode);
    const hmacHex = hmac.digest('hex');

    const hmacInt = BigInt('0x' + hmacHex);
    const seed = String(hmacInt % 10000n).padStart(4, '0');
    const padding = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

    return `${timeCode}${seed}${padding}`;
}

// --- Telegram API Helpers ---
async function sendMessage(chatId: number, text: string, replyMarkup: any = null) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const payload: any = { chat_id: chatId, text: text, parse_mode: 'Markdown' };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

async function editMessage(chatId: number, messageId: number, text: string, replyMarkup: any = null) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
    const payload: any = { chat_id: chatId, message_id: messageId, text: text, parse_mode: 'Markdown' };
    if (replyMarkup) payload.reply_markup = replyMarkup;

    await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

// --- Main Webhook Handlers for App Router ---

// Handle standard GET requests just to check if the bot is alive
export async function GET() {
    return NextResponse.json({ message: 'Bot is active.' }, { status: 200 });
}

// Handle POST requests from Telegram Webhooks
export async function POST(req: Request) {
    try {
        const update = await req.json();

        // 1. Handle standard text messages
        if (update.message && update.message.text) {
            const chatId = update.message.chat.id;
            const text = update.message.text;

            if (text === '/start get_code') {
                const newKey = generateKey();
                const successText = `⭐ Here's your key!\n🔒🔑 \`${newKey}\`\n\n📋 Tap to copy\n⚠️ Valid for 10 minutes only`;
                await sendMessage(chatId, successText);
            } 
            else if (text.startsWith('/start')) {
                const welcomeText = `👋 Hey there!\n\nWelcome to *Apna Coder Key* bot.\n\nGet your activation key in seconds:\n➤ Tap the button below\n➤ Complete the link\n➤ Receive your key\n\nLet's go! 🚀`;
                const inlineKeyboard = {
                    inline_keyboard: [[{ text: "🔑 Generate Key", callback_data: "gen_link" }]]
                };
                await sendMessage(chatId, welcomeText, inlineKeyboard);
            }
        }

        // 2. Handle Button Clicks
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            if (callbackQuery.data === 'gen_link') {
                const deepLink = `https://t.me/${BOT_USERNAME}?start=get_code`;
                const apiUrl = `https://gplinks.in/api?api=${GPLINK_API_KEY}&url=${encodeURIComponent(deepLink)}`;

                try {
                    const response = await fetch(apiUrl);
                    const data = await response.json();

                    if (data.status === 'success') {
                        const readyText = `✅ Key ready!\n\nTap the button below to get it.`;
                        const urlKeyboard = {
                            inline_keyboard: [[{ text: "🔓 Get Your Key", url: data.shortenedUrl }]]
                        };
                        await editMessage(chatId, messageId, readyText, urlKeyboard);
                    } else {
                        await editMessage(chatId, messageId, "❌ Error generating link. Please try again.");
                    }
                } catch (error) {
                    await editMessage(chatId, messageId, "❌ API communication failed.");
                }
            }
        }

        // Always return 200 OK so Telegram doesn't retry the webhook
        return NextResponse.json({ message: 'OK' }, { status: 200 });

    } catch (error) {
        console.error("Webhook processing error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}