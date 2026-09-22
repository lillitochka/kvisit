const TELEGRAM_API = (token, method) =>
  `https://api.telegram.org/bot${token}/${method}`;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({
          ok: true,
          message: "kvisite orders worker is working",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    try {
      const formData = await request.formData();

      const yourName = formData.get("yourName") || "Не указано";
      const recipientName =
        formData.get("recipientName") || "Не указано";
      const date = formData.get("date") || "Не указано";
      const greeting = formData.get("greeting") || "Не указано";
      const music = formData.get("music") || "Не указано";
      const contact = formData.get("contact") || "Не указано";
const tariff = formData.get("tariff") || "Не указано";
const wishes = formData.get("wishes") || "Не указано";
      const message =
        `🎀 НОВОЕ ЗАМОВЛЕННЯ kvisite\n\n` +
        `👤 Твоє ім'я: ${yourName}\n` +
        `💗 Ім'я отримувача: ${recipientName}\n` +
        `📅 Дата: ${date}\n\n` +
        `💌 Текст / привітання:\n${greeting}\n\n` +
        `🎵 Музика: ${music}\n` +
        `📱 Контакт: ${contact}`;

      const telegramMessage = await fetch(
        TELEGRAM_API(env.BOT_TOKEN, "sendMessage"),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: env.CHAT_ID,
            text: message,
          }),
        }
      );

      if (!telegramMessage.ok) {
        throw new Error("Telegram message failed");
      }

      const photos = formData.getAll("photos");

      for (const photo of photos) {
        if (!(photo instanceof File) || photo.size === 0) {
          continue;
        }

        const photoData = new FormData();

        photoData.append("chat_id", env.CHAT_ID);
        photoData.append("photo", photo, photo.name);

        const telegramPhoto = await fetch(
          TELEGRAM_API(env.BOT_TOKEN, "sendPhoto"),
          {
            method: "POST",
            body: photoData,
          }
        );

        if (!telegramPhoto.ok) {
          throw new Error("Telegram photo failed");
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          message: "Замовлення успішно відправлено",
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Не вдалося відправити замовлення",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }
  },
};
