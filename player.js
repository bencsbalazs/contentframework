// Player logic, SCORM integration, markdown fetching
(function () {
    /* ---------------- Fetch Markdown Slides ---------------- */
    fetch('slides.md')
        .then(r => r.text())
        .then(md => initPlayer(md))
        .catch(err => {
            document.getElementById('slide-container').innerHTML = '<p class="text-danger">Hiba a slides.md betöltésekor.</p>';
            console.error(err);
        });

    function initPlayer(mdText) {
        const rawSlides = mdText.trim().split("---");
        console.log(rawSlides)
        const slides = rawSlides.map(md => marked.parse(md));

        let current = 0;
        const total = slides.length;

        const slideContainer = document.getElementById('slide-container');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const footerPrev = document.getElementById('footer-prev');
        const footerNext = document.getElementById('footer-next');
        const slideInfo = document.getElementById('slide-info');

        /* ---------------- SCORM Integration ---------------- */
        let scormActive = false;
        function scormInit() {
            scormActive = pipwerks.SCORM.init();
            if (scormActive) {
                const loc = pipwerks.SCORM.get('cmi.location');
                if (loc && !isNaN(loc) && loc < total) { current = parseInt(loc, 10); }
                const status = pipwerks.SCORM.get('cmi.completion_status') || pipwerks.SCORM.get('cmi.core.lesson_status');
                if (status === 'not attempted' || status === '') {
                    pipwerks.SCORM.set('cmi.completion_status', 'incomplete');
                    pipwerks.SCORM.set('cmi.core.lesson_status', 'incomplete');
                }
            } else {
                console.warn('SCORM API not found – offline mód');
            }
        }
        function scormUpdate() {
            if (!scormActive) return;
            const progress = ((current + 1) / total).toFixed(2);
            pipwerks.SCORM.set('cmi.location', current);
            pipwerks.SCORM.set('cmi.progress_measure', progress);
            pipwerks.SCORM.set('cmi.core.lesson_location', current);
            if (current === total - 1) {
                pipwerks.SCORM.set('cmi.completion_status', 'completed');
                pipwerks.SCORM.set('cmi.core.lesson_status', 'completed');
            }
            pipwerks.SCORM.save();
        }
        function scormTerminate() {
            if (!scormActive) return;
            pipwerks.SCORM.set('cmi.exit', 'suspend');
            pipwerks.SCORM.save();
            pipwerks.SCORM.quit();
        }

        /* ---------------- Render & Navigation ---------------- */
        function renderSlide() {
            slideContainer.innerHTML = slides[current];
            slideInfo.textContent = `${current + 1} / ${total}`;
            updateNav();
            scormUpdate();
        }
        function updateNav() {
            const atStart = current === 0;
            const atEnd = current === total - 1;
            [prevBtn, footerPrev].forEach(b => b.disabled = atStart);
            [nextBtn, footerNext].forEach(b => b.disabled = atEnd);
        }
        const goPrev = () => { if (current > 0) { current--; renderSlide(); } };
        const goNext = () => { if (current < total - 1) { current++; renderSlide(); } };

        /* ---------------- Event listeners ---------------- */
        [prevBtn, footerPrev].forEach(btn => btn.addEventListener('click', goPrev));
        [nextBtn, footerNext].forEach(btn => btn.addEventListener('click', goNext));
        window.addEventListener('keydown', e => {
            if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); goPrev(); }
            if (['ArrowRight', 'PageDown', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); goNext(); }
        });

        /* External control */
        window.ContentPlayer = { setSlide: n => { const idx = parseInt(n, 10) - 1; if (!isNaN(idx) && idx >= 0 && idx < total) { current = idx; renderSlide(); slideContainer.focus(); } } };

        /* Boot */
        window.addEventListener('load', () => {
            if (typeof pipwerks === "undefined") {
                const script = document.createElement("script");
                script.src = "SCORM_API_wrapper.js";
                script.async = true;
                script.onload = () => {
                    scormInit(); renderSlide();
                };
                document.body.appendChild(script);
            } else {
                scormInit(); renderSlide();
            }
        });
        window.addEventListener('beforeunload', scormTerminate);
        window.addEventListener('unload', scormTerminate);
    }
})();
