const TELEGRAM_API = (token, method) =>
  `https://api.telegram.org/bot${token}/${method}`;

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
          "Content-Type": "application/json; charset=utf-8",
          ...corsHeaders
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

    try {
      if (!env.BOT_TOKEN || !env.CHAT_ID) {
        return json({
          ok: false,
          error: "Worker secrets are not configured."
        }, 500);
      }

      const form = await request.formData();
      const rawDetails = form.get("orderDetails");

      if (!rawDetails) {
        return json({
          ok: false,
          error: "Order details are missing."
        }, 400);
      }

      let details;

      try {
        details = JSON.parse(rawDetails);
      } catch {
        return json({
          ok: false,
          error: "Order details are invalid."
        }, 400);
      }

      const safe = value => {
        if (Array.isArray(value)) {
          return value.length
            ? value.map(safe).join(", ")
            : "Не вказано";
        }

        if (value === null || value === undefined || value === "") {
          return "Не вказано";
        }

        if (typeof value === "object") {
          return JSON.stringify(value);
        }

        return String(value);
      };

      const photos = form.getAll("photos")
        .filter(file => file instanceof File && file.size > 0);

      const video = form.get("videoFile");
      const audio = form.get("musicFile");

      const photoComments = Array.isArray(details.photoComments)
        ? details.photoComments
        : [];

      const photoDescriptions = photoComments.length
        ? photoComments.map((item, index) =>
            `${index + 1}. ${safe(item.filename)} — ${safe(item.comment)}`
          ).join("\n")
        : "Коментарів до фотографій немає.";

      const tariff = safe(
        details.tariff || form.get("tariff")
      );

      const message = [
        "🎀 НОВЕ ЗАМОВЛЕННЯ KVISITE",
        "",
        "📌 ТИП САЙТУ",
        safe(details.siteType),
        "",
        "💭 ІДЕЯ САЙТУ",
        safe(details.idea),
        "",
        "🎨 КОЛЬОРОВА ПАЛІТРА",
        safe(details.selectedColors),
        "",
        "📸 ФОТОГРАФІЇ",
        `Кількість: ${photos.length}`,
        `Загальні пояснення: ${safe(details.photoNotes)}`,
        "",
        "Коментарі до окремих фото:",
        photoDescriptions,
        "",
        "🎵 МУЗИКА ТА МАТЕРІАЛИ",
        `Посилання на музику: ${safe(details.musicLink)}`,
        `Інші матеріали: ${safe(details.otherMaterials)}`,
        `Відеофайл: ${
          video instanceof File && video.size > 0
            ? video.name
            : "Не додано"
        }`,
        `Аудіофайл: ${
          audio instanceof File && audio.size > 0
            ? audio.name
            : "Не додано"
        }`,
        "",
        "📝 ДОДАТКОВІ ПОБАЖАННЯ",
        safe(details.extraWishes),
        "",
        "📅 ДЕТАЛІ ЗАМОВЛЕННЯ",
        `Бажаний термін: ${safe(details.deadline)}`,
        `Промокод: ${safe(details.promoCode)}`,
        `Вартість: ${tariff}`,
        "",
        "👤 КОНТАКТИ",
        `Ім'я: ${safe(details.recipientName)}`,
        `Контакт: ${safe(details.contact)}`
      ].join("\n");

      const sendTelegram = async (method, body) => {
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
            result.description || `Telegram ${method} failed`
          );
        }

        return result;
      };

      // Розбиваємо довгі повідомлення на частини
      const splitMessage = (text, maxLength = 3800) => {
        const chunks = [];
        let current = "";

        for (const line of text.split("\n")) {
          if (line.length > maxLength) {
            if (current) {
              chunks.push(current);
              current = "";
            }

            for (let i = 0; i < line.length; i += maxLength) {
              chunks.push(line.slice(i, i + maxLength));
            }

            continue;
          }

          if ((current + "\n" + line).length > maxLength) {
            chunks.push(current);
            current = line;
          } else {
            current += (current ? "\n" : "") + line;
          }
        }

        if (current) chunks.push(current);

        return chunks;
      };

      // Надсилаємо текст заявки
      for (const part of splitMessage(message)) {
        const body = new FormData();
        body.append("chat_id", env.CHAT_ID);
        body.append("text", part);

        await sendTelegram("sendMessage", body);
      }

      const warnings = [];

      // Надсилаємо всі фотографії з їхніми коментарями
      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        const photoInfo = photoComments.find(
          item => item.filename === photo.name
        );

        const comment = photoInfo?.comment
          ? String(photoInfo.comment)
          : "Коментар не додано";

        const caption = (
          `📸 Фото ${i + 1}: ${photo.name}\n` +
          `Коментар: ${comment}`
        ).slice(0, 1000);

        try {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);

          // Для великих зображень використовуємо документ
          if (photo.size > 10 * 1024 * 1024) {
            body.append("document", photo, photo.name);
            body.append("caption", caption);

            await sendTelegram("sendDocument", body);
          } else {
            body.append("photo", photo, photo.name);
            body.append("caption", caption);

            await sendTelegram("sendPhoto", body);
          }
        } catch (error) {
          warnings.push(
            `Фото ${photo.name}: ${error.message}`
          );
        }
      }

      // Надсилаємо відео
      if (video instanceof File && video.size > 0) {
        try {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);
          body.append("video", video, video.name);
          body.append("caption", `🎬 Відео: ${video.name}`);

          await sendTelegram("sendVideo", body);
        } catch (error) {
          warnings.push(`Відео: ${error.message}`);
        }
      }

      // Надсилаємо аудіо
      if (audio instanceof File && audio.size > 0) {
        try {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);
          body.append("audio", audio, audio.name);
          body.append("caption", `🎵 Музика: ${audio.name}`);

          await sendTelegram("sendAudio", body);
        } catch (error) {
          warnings.push(`Аудіо: ${error.message}`);
        }
      }

      return json({
        ok: true,
        message: "Заявку надіслано",
        warnings
      });

    } catch (error) {
      return json({
        ok: false,
        error: String(error.message || error)
      }, 500);
    }
  }
};

