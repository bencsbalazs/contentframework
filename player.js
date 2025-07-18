class ScormPlayer extends HTMLElement {
    async connectedCallback() {
        this.slidesPath = this.getAttribute('slides') || 'slides.md';
        await this.loadDependencies();
        this.renderSkeleton();
        this.loadSlides();
    }

    loadDependencies() {
        const css = (href) => {
            if (!document.querySelector(`link[href="${href}"]`)) {
                const l = document.createElement('link');
                l.rel = 'stylesheet';
                l.href = href;
                document.head.appendChild(l);
            }
        };
        const js = (src) => {
            return new Promise((res, rej) => {
                if (document.querySelector(`script[src="${src}"]`)) return res();
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => res();
                s.onerror = () => rej(new Error(`Failed to load ${src}`));
                document.head.appendChild(s);
            });
        };

        css('https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css');
        css('https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css');
        css('./style.css')

        return js('https://cdn.jsdelivr.net/npm/marked/marked.min.js')
            .then(() => js('./SCORM_API_wrapper.js'));
    }

    renderSkeleton() {
        this.innerHTML = `
      <div class="player-box" id="player-box">
        <button class="nav-btn" id="prev-btn" aria-label="Előző">❮</button>
        <button class="nav-btn" id="next-btn" aria-label="Következő">❯</button>
        <div id="slide-container" tabindex="0"></div>
      </div>
      <div class="d-flex justify-content-center align-items-center gap-3 mt-2">
        <button class="footer-btn" id="footer-prev" aria-label="Előző">❮</button>
        <span id="slide-info" class="fw-bold"></span>
        <button class="footer-btn" id="footer-next" aria-label="Következő">❯</button>
      </div>`;

        this.slideContainer = this.querySelector('#slide-container');
        this.prevBtn = this.querySelector('#prev-btn');
        this.nextBtn = this.querySelector('#next-btn');
        this.footerPrev = this.querySelector('#footer-prev');
        this.footerNext = this.querySelector('#footer-next');
        this.slideInfo = this.querySelector('#slide-info');
    }

    loadSlides() {
        fetch(this.slidesPath)
            .then((r) => r.text())
            .then((md) => this.initPlayer(md))
            .catch((err) => {
                this.slideContainer.innerHTML = '<p class="text-danger">Hiba a slides fájl betöltésekor.</p>';
                console.error(err);
            });
    }

    initPlayer(mdText) {
        const rawSlides = mdText.trim().split("---");
        this.slides = rawSlides.map((md) => marked.parse(md));
        this.total = this.slides.length;
        this.current = 0;
        this.steps = [];
        this.stepIndex = 0;

        this.prevBtn.addEventListener('click', () => this.goPrev());
        this.nextBtn.addEventListener('click', () => this.goNext());
        this.footerPrev.addEventListener('click', () => this.goPrev());
        this.footerNext.addEventListener('click', () => this.goNext());
        window.addEventListener('keydown', (e) => {
            if (['ArrowLeft', 'PageUp', 'ArrowUp'].includes(e.key)) { e.preventDefault(); this.goPrev(); }
            if (['ArrowRight', 'PageDown', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); this.goNext(); }
        });

        this.initSCORM();
        this.renderSlide();
        window.addEventListener('beforeunload', () => this.terminateSCORM());
        window.addEventListener('unload', () => this.terminateSCORM());
    }

    initSCORM() {
        this.scormActive = window.pipwerks && pipwerks.SCORM.init();
        if (this.scormActive) {
            const loc = pipwerks.SCORM.get('cmi.location');
            if (loc && !isNaN(loc) && loc < this.total) this.current = parseInt(loc, 10);
            const status = pipwerks.SCORM.get('cmi.completion_status') || pipwerks.SCORM.get('cmi.core.lesson_status');
            if (status === 'not attempted' || status === '') {
                pipwerks.SCORM.set('cmi.completion_status', 'incomplete');
                pipwerks.SCORM.set('cmi.core.lesson_status', 'incomplete');
            }
        }
    }
    updateSCORM() {
        if (!this.scormActive) return;
        const progress = ((this.current + 1) / this.total).toFixed(2);
        pipwerks.SCORM.set('cmi.location', this.current);
        pipwerks.SCORM.set('cmi.progress_measure', progress);
        pipwerks.SCORM.set('cmi.core.lesson_location', this.current);
        if (this.current === this.total - 1) {
            pipwerks.SCORM.set('cmi.completion_status', 'completed');
            pipwerks.SCORM.set('cmi.core.lesson_status', 'completed');
        }
        pipwerks.SCORM.save();
    }
    terminateSCORM() {
        if (!this.scormActive) return;
        pipwerks.SCORM.set('cmi.exit', 'suspend');
        pipwerks.SCORM.save();
        pipwerks.SCORM.quit();
    }

    prepareSteps() {
        this.steps = Array.from(this.slideContainer.querySelectorAll('[data-animate]'));
        this.stepIndex = 0;
        this.steps.forEach((el) => {
            el.classList.add('hidden-step', 'animate__animated', el.getAttribute('data-animate') || 'animate__fadeInUp');
        });
    }
    renderSlide() {
        this.slideContainer.innerHTML = this.slides[this.current];
        this.slideInfo.textContent = `${this.current + 1} / ${this.total}`;
        this.prepareSteps();
        this.updateNav();
        this.updateSCORM();
    }
    revealStep() {
        if (this.stepIndex < this.steps.length) {
            const el = this.steps[this.stepIndex++];
            el.classList.remove('hidden-step');
            el.addEventListener('animationend', () => el.classList.remove('animate__animated'), { once: true });
            this.updateNav();
            this.updateSCORM();
            return true;
        }
        return false;
    }
    goNext() {
        if (this.revealStep()) return;
        if (this.current < this.total - 1) {
            this.current++;
            this.renderSlide();
        }
    }
    goPrev() {
        if (this.stepIndex > 0) {
            this.stepIndex--;
            const el = this.steps[this.stepIndex];
            el.classList.add('hidden-step');
            this.updateNav();
            this.updateSCORM();
            return;
        }
        if (this.current > 0) {
            this.current--;
            this.renderSlide();
        }
    }
    updateNav() {
        const atStart = this.current === 0 && this.stepIndex === 0;
        const atEnd = this.current === this.total - 1 && this.stepIndex === this.steps.length;
        [this.prevBtn, this.footerPrev].forEach((b) => (b.disabled = atStart));
        [this.nextBtn, this.footerNext].forEach((b) => (b.disabled = atEnd));
    }
}

customElements.define('scorm-player', ScormPlayer);
