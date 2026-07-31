# SETUP

من صفر إلى لعبة منشورة على Firebase Spark (المجاني). لا حاجة لبطاقة ائتمان.

---

## 1. أنشئ المشروع

1. افتح [console.firebase.google.com](https://console.firebase.google.com)
   واضغط **Add project**. أي اسم يصلح.
2. عطّل Google Analytics إن سُئلت — لا نحتاجها.

## 2. فعّل الدخول المجهول ← الخطوة التي تُنسى دائمًا

**Authentication → Get started → Sign-in method → Anonymous → Enable → Save**

بدونها سيعرض التطبيق «ما قدرنا نتصل» ولن يعمل شيء. هذا أكثر خطأ إعداد
شيوعًا، وليس له رسالة خطأ واضحة في Firebase.

## 3. أنشئ قاعدة البيانات

**Firestore Database → Create database → Production mode**

اختيار المنطقة **دائم** ولا يمكن تغييره. اختر الأقرب للاعبيك
(`europe-west1` أو `me-central1` للخليج).

"Production mode" يعني أن كل شيء ممنوع افتراضيًا — قواعدنا في
`firestore.rules` هي ما سيفتح ما يلزم فقط.

## 4. سجّل تطبيق ويب

**Project settings (⚙️) → Your apps → Web (`</>`)**

سمّه أي شيء، ولا تفعّل Firebase Hosting من هذه الشاشة (سنفعلها من الطرفية).
ستظهر لك كتلة `firebaseConfig`. انسخ القيم الست إلى `.env`:

```bash
cp .env.example .env
```

```
VITE_FB_API_KEY=AIza...
VITE_FB_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FB_PROJECT_ID=your-project
VITE_FB_STORAGE_BUCKET=your-project.appspot.com
VITE_FB_MSG_SENDER_ID=123456789
VITE_FB_APP_ID=1:123...:web:abc...
```

هذه المفاتيح **ليست أسرارًا** — تظهر في كل متصفح. الحماية كلها في
`firestore.rules`.

## 5. اربط المشروع وانشر

```bash
npm install
npm install -g firebase-tools     # لو لم تكن مثبتة
firebase login
firebase use --add                # اختر مشروعك، وسمّه default

firebase deploy --only firestore:rules
npm run build
firebase deploy --only hosting
```

ستحصل على رابط `https://your-project.web.app`. هذا هو الرابط الذي تُرسله
في مجموعة الواتساب.

## 6. جرّبها

افتح الرابط على جوالين (أو نافذتين، إحداهما خاصة — الجلسة المجهولة تُحفظ
لكل متصفح). أنشئ غرفة من الأول، وادخل باسمها من الثاني. تحتاج لاعبًا واحدًا
على الأقل في كل فريق قبل أن يعمل زر «ابدأ اللعب».

---

## التطوير محليًا

```bash
npm run dev       # http://localhost:5173
```

أضف `localhost` في **Authentication → Settings → Authorized domains** وإلا
فشل تسجيل الدخول المجهول محليًا.

للعمل على محاكي Firestore بدل قاعدة حقيقية:

```bash
firebase emulators:start --only firestore
VITE_USE_EMULATOR=1 npm run dev
```

---

## الحصص المجانية (Spark)

| | الحد | استهلاك اللعبة |
|---|---|---|
| Firestore reads | 50,000 / يوم | ~400 لكل مباراة من 6 لاعبين |
| Firestore writes | 20,000 / يوم | ~60 لكل مباراة |
| Hosting | 10 GB نقل / شهر | ~200 KB لكل زيارة أولى |
| Auth | مجاني | — |

بحساب تقريبي: أكثر من 100 مباراة يوميًا قبل أن تقترب من أي حد. المؤقّت لا
يُكتب أثناء الجولة إطلاقًا — تُكتب لحظة الانتهاء مرة واحدة، وكل جهاز يعدّ
محليًا. هذا وحده ما يجعل الأرقام أعلاه صغيرة إلى هذا الحد.

---

## عند الخطأ

| العَرَض | السبب |
|---|---|
| «ما قدرنا نتصل» | الدخول المجهول غير مفعّل (خطوة 2) |
| `permission-denied` عند إنشاء غرفة | لم تنشر `firestore.rules` بعد |
| الشاشة بيضاء بعد النشر | `.env` ناقص وقت `npm run build` — أعد البناء |
| البطاقة لا تظهر للشارح | طبيعي لثانية أثناء السحب؛ إن استمرت، افحص قواعد `secret/card` |
| «الغرفة انتهت» فجأة | آخر لاعب خرج فحُذفت الغرفة، أو مرّت 6 ساعات فأُعيد استخدام الاسم |
