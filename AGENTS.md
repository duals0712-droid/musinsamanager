# Repository Guidelines

## Project Structure & Module Organization
- `main.ts`: Electron 메인 프로세스. 앱/무신사 브라우저 창을 생성하고 preload를 연결합니다.
- `preload.ts`, `musinsa-preload.ts`: contextIsolation 브리지. 필요한 API만 노출하며 무신사 자동화 스크립트는 여기서 유지합니다.
- `src/main.tsx`: React/Vite 엔트리. `src/App.tsx`가 주요 화면(주문 다운로드/자동 후기/가격 추적)을 렌더링합니다.
- `src/components/**`: UI 컴포넌트. 레이아웃/인증 등이 분리되어 있으므로 관련 로직을 근처에 배치합니다.
- `src/lib/authService.ts`, `src/lib/supabaseClient.ts`: 인증 및 Supabase 래퍼. 키 미설정 시 로컬 폴백이 작동하니 의도적으로 구분하세요.
- `src/utils/**`, `src/types/**`: 재사용 헬퍼와 타입 정의. 새 공용 로직은 여기로 이동합니다.
- 빌드 산출물은 `dist/`(Vite)이며 Electron은 빌드된 `dist/index.html`을 로드합니다.

## Build, Test, and Development Commands
- `npm install`: 의존성 설치 (Node 18+ 권장).
- `npm run dev`: Vite 렌더러 + electronmon 동시 실행(기본 포트 5180).
- `npm run dev:renderer` / `npm run dev:electron`: 각 프로세스만 단독 실행.
- `npm run build`: Vite 번들 후 `npm run build:main`으로 Electron TypeScript 컴파일.
- `npm run lint`: TypeScript 타입 체크(no emit).
- `npm run preview`: 빌드 결과를 로컬에서 확인.

## Coding Style & Naming Conventions
- TypeScript + React 함수형 컴포넌트, Tailwind 유틸 클래스 사용.
- 들여쓰기 2스페이스, 단일 인용부호와 세미콜론 유지.
- 컴포넌트/타입 파일은 PascalCase(`AuthGate.tsx`), 헬퍼/후크는 camelCase(`hangulKeyboard.ts`)로 이름 지정.
- Tailwind 클래스는 레이아웃 → 여백 → 색상 순으로 정돈하고, 복잡한 계산은 `useMemo`/`useEffect`로 분리합니다.

## Testing Guidelines
- 현재 공식 테스트 스위트 없음; 최소한 `npm run lint`로 타입 리그레션을 차단하세요.
- 새 로직 함수는 `src/__tests__` 또는 인접 `*.test.ts`에 단위 테스트 추가를 권장(Jest/RTL 채택 시).
- Supabase 미설정 로컬 모드와 실제 키 설정 모드 모두를 커버하는 케이스를 고려합니다.

## Commit & Pull Request Guidelines
- Git 이력이 없으므로 메시지는 영어 명령형 한 줄(`Add auth fallback`, `Fix musinsa login status`)로 간결히 작성합니다.
- PR에는 변경 요약, 테스트/린트 결과, 관련 이슈 링크, UI 변경 시 스크린샷을 포함합니다.
- 환경 변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)나 민감 정보가 로그나 스크린샷에 노출되지 않도록 주의합니다.

## Security & Configuration Tips
- Supabase 키는 루트 `.env`에 저장하고 `import.meta.env`로 접근합니다. 키가 없으면 auth가 로컬 폴백이 되므로 의도를 명시하세요.
- Electron은 `contextIsolation`을 켜고 있으니 브리지 API는 preload 파일에 한정하고, DOM 자동화는 `musinsa-preload.ts`에서 최소한으로 유지합니다.
