# AI Homework Assistant - Design Guidelines

## Design Approach

**Selected Approach:** Design System with Educational References

Drawing inspiration from modern productivity tools (Linear, Notion) combined with educational platforms (Khan Academy, Duolingo) to create a professional yet approachable learning environment. The design prioritizes clarity, trust-building, and efficient interaction patterns suitable for both students and educators.

**Justification:** This is a utility-focused educational tool where efficiency, learnability, and trust are paramount. The dual-interface system requires consistency and professionalism while maintaining warmth for student engagement.

---

## Core Design Elements

### A. Color Palette

**Light Mode:**
- Primary: 220 85% 55% (Trustworthy blue - education standard)
- Background: 0 0% 100% (Pure white)
- Surface: 220 15% 97% (Light gray cards)
- Text Primary: 220 20% 15% (Nearly black)
- Text Secondary: 220 10% 45% (Medium gray)
- Success: 145 65% 45% (For correct answers/progress)
- Border: 220 15% 88%

**Dark Mode:**
- Primary: 220 85% 60% (Slightly brighter for contrast)
- Background: 220 20% 10% (Deep blue-black)
- Surface: 220 15% 15% (Elevated cards)
- Text Primary: 220 15% 95% (Off-white)
- Text Secondary: 220 10% 65% (Light gray)
- Success: 145 60% 50%
- Border: 220 15% 20%

**Accent Colors (Strategic Use Only):**
- Student Role Indicator: 270 60% 65% (Soft purple)
- Teacher Role Indicator: 35 80% 55% (Warm orange)
- AI Avatar: 190 70% 50% (Friendly teal)

### B. Typography

**Font Families:**
- Primary: 'Inter' (Google Fonts) - for UI, body text, and teacher interface
- Display: 'Cal Sans' or 'Inter' at larger weights for hero sections
- Code/Technical: 'JetBrains Mono' if showing any formulas/code snippets

**Type Scale:**
- Hero/H1: 3xl to 4xl font-bold (teacher dashboard headers)
- H2: 2xl font-semibold (section titles)
- H3: xl font-semibold (card headers, assignment titles)
- Body: base font-normal (chat messages, descriptions)
- Small: sm font-medium (timestamps, metadata)
- Tiny: xs font-normal (helper text, labels)

**Student Chat Interface:**
- Student messages: base font-normal
- AI tutor messages: base font-normal with slight leading increase for readability
- Question prompts: base font-medium

### C. Layout System

**Spacing Primitives:** 2, 4, 6, 8, 12, 16 (in Tailwind units)
- Micro spacing: p-2, gap-2 (tight elements)
- Standard spacing: p-4, gap-4, mb-4 (default component padding)
- Section spacing: py-8, my-8 (between major sections)
- Page margins: p-6 md:p-8 lg:p-12 (responsive page containers)

**Grid System:**
- Teacher Dashboard: 12-column grid on desktop, single column on mobile
- Assignment Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Chat Interface: Full-width with max-w-3xl container centered

**Containers:**
- Chat container: max-w-3xl mx-auto
- Dashboard: max-w-7xl mx-auto
- Forms: max-w-2xl mx-auto

### D. Component Library

**Navigation (Teacher Interface):**
- Top navigation bar with logo, main sections (Dashboard, Create Assignment, Schedule, Settings)
- Height: h-16
- Background: Surface color with subtle border-b
- Sticky positioning on scroll

**Student Chat Interface:**
- Fixed header showing assignment topic and AI avatar
- Scrollable message area with alternating message bubbles
- Fixed input area at bottom with text field and send button
- Message bubbles: rounded-2xl with p-4, distinct colors for student vs AI

**Assignment Cards:**
- Rounded corners: rounded-xl
- Padding: p-6
- Shadow: subtle shadow-sm hover:shadow-md transition
- Border: border border-color
- Content: Topic title (font-semibold text-lg), grade/subject metadata, scheduled time, status badge

**Forms (Teacher Assignment Creation):**
- Label-above-input pattern with gap-2
- Inputs: rounded-lg border border-color p-3 with focus:ring-2 focus:ring-primary
- Select dropdowns: Consistent styling with inputs
- Date/time picker: Native or lightweight library matching design
- Submit button: Full-width on mobile, auto-width on desktop

**Chat Messages:**
- AI messages: Left-aligned, surface background, rounded-2xl rounded-tl-sm
- Student messages: Right-aligned, primary color background, text-white, rounded-2xl rounded-tr-sm
- Timestamp: text-xs text-secondary below each message group
- Avatar: 32x32 circle for AI, initials for student

**Buttons:**
- Primary: bg-primary text-white rounded-lg px-6 py-3 font-medium
- Secondary: bg-surface border border-color rounded-lg px-6 py-3
- Ghost: text-primary hover:bg-surface rounded-lg px-4 py-2
- Icon buttons: p-2 rounded-lg hover:bg-surface

**Badges:**
- Status indicators: rounded-full px-3 py-1 text-xs font-medium
- Active: bg-success/10 text-success
- Scheduled: bg-primary/10 text-primary
- Completed: bg-gray/20 text-secondary

**Dashboard Widgets:**
- Statistics cards: Grid layout showing active assignments, completion rate, upcoming notifications
- Each card: p-6 rounded-xl bg-surface with icon, large number (text-3xl font-bold), label

### E. Interactions & Animations

**Use Sparingly:**
- Message send: Gentle slide-up fade-in for new messages (duration-200)
- Button hover: Scale-102 with subtle shadow increase
- Card hover: Shadow elevation change (shadow-sm to shadow-md)
- Page transitions: Simple fade between views
- Loading states: Subtle skeleton screens with pulse animation for chat loading

**No Animation:**
- Text input interactions
- Form validation feedback (instant)
- Navigation between sections

---

## Interface-Specific Guidelines

### Teacher Dashboard (Desktop-First)
- Hero section with greeting and quick stats (h-64)
- Three-column grid for assignment cards
- Right sidebar: Upcoming notifications, quick create button
- Professional, efficient layout prioritizing information density

### Student Chat (Mobile-First)
- Full-screen chat interface
- Friendly AI greeting message on load
- Progressive question flow with encouraging language
- Clear visual distinction between student and AI messages
- Bottom-fixed input prevents keyboard issues

### Assignment Creation Flow
- Multi-step form with progress indicator at top
- Step 1: Topic, Grade, Subject
- Step 2: AI behavior instructions (how to assess, what questions to ask)
- Step 3: Schedule notification time
- Clear, labeled sections with ample spacing (gap-6 between form groups)

---

## Images

**Teacher Dashboard Header:**
- Illustration showing teacher-student-AI connection (abstract, friendly)
- Position: Hero area background, subtle opacity
- Size: Full-width, h-48 on desktop
- Style: Modern, minimal illustration with primary color accent

**Student Chat Welcome:**
- Small AI avatar/mascot icon (friendly robot or character)
- Position: Chat header, 40x40 circle
- Style: Friendly, approachable, consistent with brand colors

**Empty States:**
- Illustration when no assignments exist
- Position: Center of dashboard
- Size: max-w-sm
- Style: Encouraging, shows teacher creating first assignment

---

## Responsive Behavior

- Mobile (< 768px): Single column, full-width chat, stacked forms
- Tablet (768-1024px): Two-column grids, side-by-side forms
- Desktop (> 1024px): Full multi-column layouts, optimal chat width (max-w-3xl)