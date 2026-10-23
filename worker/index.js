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
          return value.join(", ") || "Не вказано";
        }
        if (value === null || value === undefined || value === "") {
          return "Не вказано";
        }
        return String(value);
      };

      const message = [
        "🎀 НОВЕ ЗАМОВЛЕННЯ KVISITE",
        "",
        `Для кого сайт: ${safe(details.forWhom)}`,
        `Ім’я отримувача: ${safe(details.recipientName)}`,
        `Форми імені: ${safe(details.nameForms)}`,
        `Привід: ${safe(details.occasion)}`,
        `Потрібно до: ${safe(details.deadline)}`,
        "",
        "ДИЗАЙН",
        `Опис: ${safe(details.design)}`,
        `Шрифт: ${safe(details.font)}`,
        `Пристрій: ${safe(details.device)}`,
        "",
        "ІДЕЯ САЙТУ",
        safe(details.idea),
        "",
        `Функції: ${safe(details.features)}`,
        `Посилання на музику: ${safe(details.musicLink)}`,
        `Фотографії: ${safe(details.photos)}`,
        `Відео: ${safe(details.video)}`,
        `Аудіофайл: ${safe(details.musicFile)}`,
        "",
        `Додаткові побажання: ${safe(details.extraWishes)}`,
        `Промокод: ${safe(details.promoCode)}`,
        "",
        `Контакт: ${safe(details.contact)}`,
        `Вартість: ${safe(form.get("tariff"))}`
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

      await sendTelegram(
        "sendMessage",
        (() => {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);
          body.append("text", message);
          return body;
        })()
      );

      const photos = form.getAll("photos");
      const video = form.get("videoFile");
      const audio = form.get("musicFile");
      const warnings = [];

      for (const photo of photos) {
        if (!(photo instanceof File) || photo.size === 0) continue;

        try {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);
          body.append("photo", photo, photo.name);
          body.append("caption", `Фото до замовлення Kvisite: ${photo.name}`);
          await sendTelegram("sendPhoto", body);
        } catch (error) {
          warnings.push(`Фото ${photo.name}: ${error.message}`);
        }
      }

      if (video instanceof File && video.size > 0) {
        try {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);
          body.append("video", video, video.name);
          body.append("caption", `Відео до замовлення Kvisite: ${video.name}`);
          await sendTelegram("sendVideo", body);
        } catch (error) {
          warnings.push(`Відео: ${error.message}`);
        }
      }

      if (audio instanceof File && audio.size > 0) {
        try {
          const body = new FormData();
          body.append("chat_id", env.CHAT_ID);
          body.append("audio", audio, audio.name);
          body.append("caption", `Музика до замовлення Kvisite: ${audio.name}`);
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
