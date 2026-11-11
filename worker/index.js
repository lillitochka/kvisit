
const TELEGRAM_API = (token, method) =>
  `https://api.telegram.org/bot${token}/${method}`;

const MAX_TELEGRAM_FILE_SIZE = 50 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (request.method !== "POST") {
      return json({
        ok: true,
        message: "Kvisite orders worker is working"
      });
    }

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return json({
        ok: false,
        error: "Worker secrets are not configured."
      }, 500);
    }

    async function telegram(method, body) {
      const response = await fetch(
        TELEGRAM_API(env.BOT_TOKEN, method),
        {
          method: "POST",
          body
        }
      );

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(
          result.description || "Telegram API error"
        );
      }

      return result;
    }

    async function sendText(text) {
      const chunks = [];

      while (text.length > 0) {
        let cut = 3900;

        if (text.length > cut) {
          const newline = text.lastIndexOf("\n", cut);
          if (newline > 2000) cut = newline;
        }

        chunks.push(text.slice(0, cut));
        text = text.slice(cut);
      }

      for (const chunk of chunks) {
        const body = new FormData();
        body.append("chat_id", env.CHAT_ID);
        body.append("text", chunk);

        await telegram("sendMessage", body);
      }
    }

    async function sendFile(method, file, fieldName) {
      const body = new FormData();
      body.append("chat_id", env.CHAT_ID);
      body.append(fieldName, file, file.name);

      await telegram(method, body);
    }

    try {
      const formData = await request.formData();

      let details;

      try {
        details = JSON.parse(
          formData.get("orderDetails") || "{}"
        );
      } catch {
        return json({
          ok: false,
          error: "Не вдалося прочитати дані анкети."
        }, 400);
      }

      const {
        siteType = "",
        tariff = "",
        recipientName = "",
        contact = "",
        promoCode = "",
        deadline = "",
        idea = "",
        selectedColors = [],
        photoNotes = "",
        photoComments = [],
        musicLink = "",
        otherMaterials = "",
        extraWishes = ""
      } = details;

      const lines = [
        "♡ НОВЕ ЗАМОВЛЕННЯ KVISITE ♡",
        "",
        `Тип сайту: ${siteType}`,
        `Вартість: ${tariff || formData.get("tariff") || "Не вказана"}`,
        "",
        "ІМ'Я ТА КОНТАКТИ",
        `Ім'я: ${recipientName}`,
        `Контакт: ${contact}`,
        `Промокод: ${promoCode || "Не вказаний"}`,
        "",
        "ЗАДУМКА",
        idea || "Не вказана",
        "",
        "КОЛЬОРИ",
        Array.isArray(selectedColors) && selectedColors.length
          ? selectedColors.join(", ")
          : "Не обрані",
        "",
        "ФОТОГРАФІЇ",
        Array.isArray(photoComments) && photoComments.length
          ? photoComments.map((item, index) =>
              `${index + 1}. ${item.filename || "Фото"}: ${item.comment || "Без коментаря"}`
            ).join("\n")
          : "Коментарів немає",
        "",
        `Загальні пояснення до фото: ${photoNotes || "Немає"}`,
        "",
        "МУЗИКА ТА МАТЕРІАЛИ",
        `Посилання на музику: ${musicLink || "Немає"}`,
        `Інші матеріали: ${otherMaterials || "Немає"}`,
        "",
        "ДОДАТКОВІ ПОБАЖАННЯ",
        extraWishes || "Немає",
        "",
        `Бажаний термін: ${deadline || "Не вказаний"}`
      ];

      const photos = formData
        .getAll("photos")
        .filter(file => file && file.size > 0);

      const musicFile = formData.get("musicFile");
      const videoFile = formData.get("videoFile");

      const music = musicFile && musicFile.size > 0
        ? musicFile
        : null;

      const video = videoFile && videoFile.size > 0
        ? videoFile
        : null;

      lines.push("");
      lines.push("ДОДАНІ ФАЙЛИ");
      lines.push(`Фотографій: ${photos.length}`);
      lines.push(`Музика: ${music ? music.name : "Не додана"}`);
      lines.push(`Відео: ${video ? video.name : "Не додане"}`);

      await sendText(lines.join("\n"));

      const warnings = [];

      for (const photo of photos) {
        try {
          if (photo.size > MAX_TELEGRAM_FILE_SIZE) {
            warnings.push(
              `Фото ${photo.name}: завеликий файл для Telegram.`
            );
            continue;
          }

          if (photo.size <= 10 * 1024 * 1024) {
            await sendFile("sendPhoto", photo, "photo");
          } else {
            await sendFile("sendDocument", photo, "document");
          }
        } catch (error) {
          warnings.push(
            `Фото ${photo.name}: ${error.message}`
          );
        }
      }

      if (music) {
        try {
          if (music.size > MAX_TELEGRAM_FILE_SIZE) {
            warnings.push("Музичний файл завеликий для Telegram.");
          } else {
            await sendFile("sendAudio", music, "audio");
          }
        } catch (error) {
          warnings.push(`Музика: ${error.message}`);
        }
      }

      if (video) {
        try {
          if (video.size > MAX_TELEGRAM_FILE_SIZE) {
            warnings.push("Відеофайл завеликий для Telegram.");
          } else {
            await sendFile("sendVideo", video, "video");
          }
        } catch (error) {
          warnings.push(`Відео: ${error.message}`);
        }
      }

      return json({
        ok: true,
        message: "Замовлення отримано.",
        warnings
      });

    } catch (error) {
      return json({
        ok: false,
        error: error.message || "Помилка сервера."
      }, 500);
    }
  }
};

