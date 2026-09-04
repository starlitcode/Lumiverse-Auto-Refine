/*
 * Auto Refine frontend.
 *
 * The whole surface is one drawer tab. That is chosen rather than
 * a default: this is a thing you keep open and glance at while you write, not a
 * form you fill in and close. You want to see what the last refine did to your
 * prose, and put it back if you disagree, without stopping to open anything.
 *
 * A drawer tab has no moment where it closes, so there is no "nothing sticks
 * until Save" to build on. Everything here saves as you change it, which is
 * safe because nothing on this panel is destructive on its own: a rule is text
 * until a reply arrives, and the two switches that make something happen are
 * switches, which is exactly the control somebody expects to act at once.
 *
 * None of the refining happens on this side. This collects what the reader
 * wants, hands it to the backend, and shows what came back.
 */
const VERSION = "1.0.0";
const STORE_KEY = "lv-auto-refine:settings:v1";
// The settings, grouped the way somebody thinks about them. Import, export,
// reset and the bug report all work in these, so a part means the same thing
// wherever you meet it and the four cannot drift apart.
//
// Two of them are not settings at all: presets and the chats you switched off
// live in their own storage, and each is handled where it is named.
const PARTS = [
    {
        id: "prompt",
        label: "Your prompt",
        what: "Every block: its name, its text, its role and its place in the order.",
        keys: ["blocks", "userBlocks"],
    },
    {
        id: "context",
        label: "Context",
        what: "How much of the chat goes in.",
        keys: ["contextMessages", "maxHistoryTokens", "maxLoreTokens"],
    },
    {
        id: "model",
        label: "Model and thinking",
        what: "Which connection refines, how much it thinks, and how long to wait.",
        keys: ["connectionId", "thinkingMode", "thinkingEffort", "timeoutSecs"],
    },
    {
        id: "samplers",
        label: "Samplers",
        what: "Temperature and the rest, where you set them.",
        keys: ["samplers"],
    },
    {
        id: "limits",
        label: "Limits and protection",
        what: "What it refuses to save, what it hides from the model, and what it asks before writing.",
        keys: [
            "maxGrowthPct",
            "minShrinkPct",
            "keepOriginal",
            "confirmBeforeSave",
            "protectOn",
            "protectThinking",
            "protectInline",
            "thinkTags",
            "stripAnswerThinking",
            "shieldAdd",
            "shieldKeep",
            "guardRefusal",
            "guardPreamble",
            "guardSoften",
            "softenPct",
            "softenWords",
            "retryRefine",
            "skipWhenClean",
            "wrapOutput",
            "streamProgress",
        ],
    },
    {
        id: "alerts",
        label: "Alerts and sound",
        what: "The card that comes up on the page, the brief message, and the sound.",
        keys: ["popup", "toast", "soundOn", "soundUrl", "soundVolume"],
    },
    {
        id: "reach",
        label: "Buttons and the widget",
        what: "The message button, the floating button, and the input bar row.",
        keys: ["widgetOn", "inputRefine"],
    },
    {
        id: "switches",
        label: "The on and off switches",
        what: "Whether it is running at all, and whether the automatic pass is on.",
        keys: ["enabled", "refineOn"],
    },
];
// The two that are not settings. Named here so a picker can offer them beside
// the rest rather than as a separate afterthought.
const PART_PRESETS = "presets";
const PART_SETUPS = "setups";
const PART_CHATS = "chats";
// What a bug report can carry. Separate from the parts above because these are
// about the report rather than about the settings: what is in the panel, what
// it has been doing, and what it is running on.
const DEBUG_PARTS = [
    { id: "settings", label: "Your settings", what: "Every switch and number, but never the text of your prompt." },
    { id: "prompt", label: "The shape of your prompt", what: "Block names, roles, order and which macros each one uses. Not what the blocks say." },
    { id: "counts", label: "Counts for this session", what: "How many refines were saved, dropped and put back, and why." },
    { id: "log", label: "What it has been doing", what: "The last dozen lines from the Log tab." },
    { id: "chat", label: "Where you are", what: "Whether a chat is open and whether it has a card. No ids, no names." },
    { id: "browser", label: "Your browser", what: "The user agent string and the screen size, which is what a layout bug needs." },
];
// What the manifest asks for, what each one is for, and what still works
// without it. Refusing one is a choice somebody is allowed to make, so the
// panel names the cost rather than nagging.
const PERMS = [
    {
        id: "generation",
        label: "Generation",
        why: "Runs the refine.",
        without: "Nothing is refined at all, by any path. This is the one it cannot work without.",
        fatal: true,
    },
    {
        id: "chat_mutation",
        label: "Chat mutation",
        why: "Saves the rewrite over the message.",
        without: "Refines still run and cost you a model call, and nothing can be written, so nothing changes.",
        fatal: true,
    },
    {
        id: "chats",
        label: "Chats",
        why: "Says which chat you are in and which card it belongs to.",
        without: "It falls back to the last chat it saw a reply in, so the per-chat switch and the buttons can act on a chat you have left.",
    },
    {
        id: "characters",
        label: "Characters",
        why: "Reads the card behind {{description}} and the rest.",
        without: "Those macros come back empty and their blocks are left out. Refining carries on.",
    },
    {
        id: "world_books",
        label: "World books",
        why: "Reads the lorebook entries this chat has active, behind {{lore}}.",
        without: "That macro comes back empty and its block is left out. Refining carries on.",
    },
    {
        id: "ui_panels",
        label: "Interface panels",
        why: "The floating button.",
        without: "Everything works except the floating button, and its switch says so.",
    },
];
const CARET_OPEN = "\u25be";
const CARET_SHUT = "\u25b8";
const CHATS_OFF_KEY = "lv-auto-refine:chats-off:v1";
const PRESETS_KEY = "lv-auto-refine:presets:v1";
const SETUPS_KEY = "lv-auto-refine:setups:v1";
// What a model setup carries: which connection refines, how much it thinks, how
// long to wait for it, and the samplers. Nothing about the prompt, because the
// point of keeping them apart is being able to run the same prompt through a
// cheap model and an expensive one without editing anything.
//
// A connection id is in here, which is the one thing a preset refuses to carry.
// The reason a preset refuses is that presets go into files people share, and
// an id from somebody else's account names nothing on yours. A setup is not
// offered as a file: it lives in this browser and in your own account, where
// the id means what it says.
const SETUP_KEYS = ["connectionId", "thinkingMode", "thinkingEffort", "timeoutSecs", "samplers"];
// What a preset carries: everything that decides how a refine reads. The rest
// stays yours whichever preset you load, which is the split that makes a preset
// worth having. A connection is not in here on purpose: an id from somebody
// else's account names nothing on yours, so a shared preset that carried one
// would quietly point at nothing.
const PRESET_KEYS = [
    "blocks",
    "userBlocks",
    "contextMessages",
    "maxHistoryTokens",
    "maxLoreTokens",
    "samplers",
    "thinkingMode",
    "thinkingEffort",
];
// Every setting, with the value a fresh install starts on.
const CONFIG = {
    enabled: true,
    // The automatic pass is off until asked for. This rewrites saved messages
    // with a model, which is not something to start doing to somebody's chat
    // because they installed an extension.
    refineOn: false,
    connectionId: "",
    thinkingMode: "off",
    thinkingEffort: "medium",
    timeoutSecs: 90,
    maxGrowthPct: 60,
    minShrinkPct: 40,
    keepOriginal: true,
    confirmBeforeSave: false,
    toast: true,
    // A sound when a refine lands, off until asked for. An extension that starts
    // making noise because it was installed is an extension people uninstall.
    soundOn: false,
    // Empty means the built-in two-note blip, which is synthesised rather than
    // shipped so there is no audio file in the repository. A reader's own sound
    // is held as a data URL, which is why it is capped.
    soundUrl: "",
    soundVolume: 60,
    // The floating button: one tap to refine the latest reply without opening the
    // drawer. Needs the ui_panels permission, and says so if it is missing.
    widgetOn: false,
    // The card that comes up on the page when a refine lands, with the before,
    // the after and the way back on it. On by default: a refine changes writing
    // somebody was reading, and making them find a tab to see what changed is
    // the wrong way round.
    popup: true,
    // What one tap does when there is a refine to put back. On, the button turns
    // into an undo; off, a tap always refines.
    //
    // Off by default. A button that silently becomes a different button is a
    // button nobody can read, and while it stands there is no tap left for
    // starting a refine. The card that comes up is where putting one back
    // belongs: it says what it would be putting back.
    widgetUndo: false,
    // How big the floating button is, across. The same default and the same 28
    // to 96 range as Auto Retry's floating button, so the two sit at matching
    // sizes when somebody runs both.
    widgetSize: 44,
    // Markup, code and the model's own thinking are lifted out of a message
    // before it is sent and put back afterwards. On by default: a rewrite that
    // eats a colour tag is the most common way this kind of extension ruins
    // somebody's reply, and they only notice three messages later.
    protectOn: true,
    protectThinking: true,
    // Take the refiner's own working out of its answer. Separate from the one
    // above, which is about working already in the passage.
    stripAnswerThinking: true,
    // Patterns of the reader's own, added to the built-in ones, and patterns that
    // keep a region visible even when a built-in matched it.
    shieldAdd: "",
    shieldKeep: "",
    // Names the reader adds, one per line, on top of the built-in set.
    thinkTags: "",
    // The checks on what an answer says. All on, because each is a shape that was
    // going to be written into somebody's chat.
    guardRefusal: true,
    guardPreamble: true,
    guardSoften: true,
    softenPct: 60,
    softenWords: "",
    // Extra asks after a failed check. None by default: somebody who never opened
    // this has not agreed to pay for three refines where they asked for one.
    retryRefine: 0,
    // Let a plain scan call off the automatic pass when there is nothing on the
    // phrase list in a reply. Off by default, because a clean scan means nothing
    // on the list, never nothing wrong.
    skipWhenClean: false,
    // Asking for the rewrite inside <REFINED> tags rather than on its own. A
    // model that cannot help adding a sentence of its own still puts the rewrite
    // between the tags, and taking what is between them is exact.
    wrapOutput: true,
    // Streaming the refine so the panel can show it arriving. The answer is the
    // same either way; this only decides whether you can watch it.
    streamProgress: true,
    // Rows in the chat input's Extras menu. Off until asked for: they reach into
    // the page, and an extension that redecorates somebody's chat on install is
    // one they uninstall.
    //
    // There was a button on every message too, put into Lumiverse's own row of
    // actions. It is gone. That row belongs to the app and every extension wants
    // a seat in it, the floating button and Extras both reach everything it
    // reached, and it was the one part of this that had to guess at the page's
    // shape twice over: the message wrapper and the action bar inside it.
    // Refining what you are about to send, from the input bar, before it is sent.
    // Off by default: it edits the box you are typing in, which is not something
    // to start doing unasked.
    inputRefine: false,
    // How many messages of the run-up go in the prompt. A rewrite that cannot see
    // what just happened flattens a scene into general prose, which is the
    // failure people blame on the model.
    contextMessages: 4,
    // Budgets in tokens, which is the unit a context window is measured in.
    // Whole entries and whole messages are kept or dropped: half a lorebook entry
    // is worse than one fewer of them.
    maxLoreTokens: 2500,
    maxHistoryTokens: 4500,
    // Which tab the panel opens on, remembered so it comes back where you left it.
    tab: "prompt",
    // What each of the three carries. Empty means everything, which is what a
    // fresh install wants and what somebody who never opens these expects.
    exportParts: {},
    importParts: {},
    resetParts: {},
    debugParts: {},
    // The prompt layout. Empty means the default order below, so a fresh install
    // does not carry a copy of it around and a later change to the default
    // reaches anybody who never edited theirs.
    blocks: [],
    // The prompt used when the message being refined is one of yours. Empty means
    // you have not written one and the reply prompt is used instead.
    userBlocks: [],
    // Sampler values for the refine call. Empty means the connection's preset
    // decides, which is the right default: somebody who tuned a preset should not
    // have it quietly overridden by an extension.
    samplers: {},
};
// The macros a block can carry. Ours are answered here; the rest are handed to
// Lumiverse, which already resolves them for every other prompt it builds.
const MACROS = [
    { tag: "{{message}}", what: "The turn being refined. Every prompt needs this one.", ours: true },
    { tag: "{{history}}", what: "The messages leading up to it, as many as Context says.", ours: true },
    { tag: "{{lore}}", what: "The lorebook entries this chat has active.", ours: true },
    {
        tag: "{{protect_notes}}",
        what: "Only when protection is on and it found something. Puts in: \"Parts of this passage " +
            "have been replaced with tokens shaped like [[AR1]], [[AR2]] and so on. Each stands in " +
            "for formatting that has to survive the edit exactly as it is. Copy every one into your " +
            "answer unchanged and in the same place, treating each as a single character you cannot " +
            "spell.\" It is the one macro that puts words rather than your chat into the prompt, and " +
            "they are here so you can read them: the tokens are this extension's own invention and " +
            "nothing in your chat could describe them.",
        ours: true,
    },
    { tag: "{{description}}", what: "The character card's description.", ours: false },
    { tag: "{{personality}}", what: "The card's personality.", ours: false },
    { tag: "{{scenario}}", what: "The card's scenario.", ours: false },
    { tag: "{{persona}}", what: "Your persona for this chat.", ours: false },
    { tag: "{{char}}", what: "The character's name.", ours: false },
    { tag: "{{user}}", what: "Your name.", ours: false },
];
const TURN_MACRO = "{{message}}";
// The tag a prompt puts the model's working in. What is inside it is streamed
// back to the panel while the refine runs and never reaches the story, so a
// prompt that does not ask for it has nothing to show while it writes.
const NOTES_TAG = /<\s*refine_notes\s*>/i;
// ---- the prompts that ship with it ----
// Two questions, four answers. Does your model reason, and how much of the
// ground do you want covered.
//
// One name for the quick pair and one for the thorough pair, so the pairing is
// visible at a glance, and the two that need a reasoning model say so in the
// name rather than leaving somebody to find out by getting a worse rewrite.
//
// What the names deliberately do not claim is how the two pairs compare with
// each other. They were Short and Detailed in two pairs, and that was a promise
// the set could not keep: a close read for a thinking model is about the size
// of a quick read for a plain one, because a model that reasons is handed less
// on purpose. Each description says what it costs, which is the only place that
// belongs.
//
// A model that reasons is given the standard and left to apply it. A model that
// does not is given the list, because it will match a list and will not derive
// one. That is why the reasoning pair is the smaller pair.
// The pages of setting that hold still for a whole chat: who the story follows,
// who is writing it with you, and what is true in its world. They sit above the
// volatile ones for caching, which is explained where the presets are built.
const SCENE_BLOCKS = [
    {
        id: "character",
        name: "Who the story follows",
        on: true,
        role: "system",
        text: "<who_the_story_follows>\n{{description}}\n</who_the_story_follows>",
    },
    {
        id: "persona",
        name: "Who you are writing with",
        on: true,
        role: "system",
        text: "<your_co_author>\n{{persona}}\n</your_co_author>",
    },
    {
        id: "lore",
        name: "What is true in this world",
        on: true,
        role: "system",
        text: "<what_is_true>\n{{lore}}\n</what_is_true>",
    },
];
// The pages before this one. Redrawn every single turn, so it goes as late as it
// can and still be read as setting.
const RECENT_BLOCK = {
    id: "history",
    name: "The pages before this one",
    on: true,
    role: "system",
    text: "<earlier_pages>\n{{history}}\n</earlier_pages>",
};
const TURN_BLOCK = {
    id: "turn",
    name: "The passage to refine",
    on: true,
    role: "user",
    text: "<passage_to_refine>\n{{message}}\n</passage_to_refine>",
};
// The shape of the answer, drawn out as a template. A model matching a shape it
// can see keeps to it far more reliably than one working from a sentence about
// the shape, and the two tags are the only part of this prompt that has to come
// back exactly right.
//
// Shouted, and read back case-insensitively so a prompt written in lower case
// still works.
const HOW_TO_ANSWER = {
    id: "answer",
    name: "How to answer",
    on: true,
    role: "system",
    text: "<how_to_answer>\n" +
        "Your whole answer takes this shape:\n\n" +
        "<REFINED>\n" +
        "the passage, rewritten\n" +
        "</REFINED>\n\n" +
        "Only what sits between those two tags is saved, so both belong in every " +
        "answer. Inside them, write the passage as a reader would meet it.\n\n" +
        "Anything outside the tags reaches me and never reaches the story, so a " +
        "note about the edit belongs there if you have one.\n" +
        "</how_to_answer>\n\n" +
        "{{protect_notes}}",
};
// The reasoning version. The working goes in a tag of its own, ahead of the
// rewrite, and that tag sits outside <REFINED> so none of it can reach the
// story. It comes back to the panel and is shown beside the refine, which is
// what makes asking for it worth the tokens: working nobody reads is only a
// bill.
//
// Only the reasoning prompts carry it. A model that does not reason, handed a
// thinking tag, fills it with a summary of what it is about to do and then does
// something else.
const THINKS_ANSWER = {
    id: "answer",
    name: "How to answer",
    on: true,
    role: "system",
    text: "<how_to_answer>\n" +
        "Your whole answer takes this shape, in this order:\n\n" +
        "<REFINE_NOTES>\n" +
        "What reads weakly as it stands, quoted so I can see the line you mean.\n" +
        "What you are going to change, and why.\n" +
        "What you looked at and chose to keep.\n" +
        "</REFINE_NOTES>\n" +
        "<REFINED>\n" +
        "the passage, rewritten\n" +
        "</REFINED>\n\n" +
        "<REFINE_NOTES> is the one place your working goes. Where you would reach " +
        "for <think>, <thinking>, <reasoning> or a scratchpad of your own, put that " +
        "line inside <REFINE_NOTES> instead; avoid opening a second thinking tag of " +
        "any kind.\n\n" +
        "What you write there reaches me and never reaches the story, so it costs " +
        "the draft nothing however long it runs.\n\n" +
        "Only what sits between <REFINED> and </REFINED> is saved. Inside those " +
        "tags, write the passage as a reader would meet it; what you changed and " +
        "why is already said above.\n" +
        "</how_to_answer>\n\n" +
        "{{protect_notes}}",
};
// The phrase list, the same in both lengths. These turn up in machine-written
// fiction several times a session and in published fiction almost never.
const PHRASES = "- a breath they did not know they were holding\n" +
    "- a breath that hitches, or catches\n" +
    "- a heart hammering, pounding, racing or thundering against ribs\n" +
    "- a voice barely above a whisper\n" +
    "- eyes that darken, or flick, or trace\n" +
    "- a shiver running down a spine, or sent anywhere\n" +
    "- the ghost of a smile\n" +
    "- the air thick with anything\n" +
    "- something shifting, hanging or crackling in the air\n" +
    "- an emotion given as a mixture of two other emotions\n" +
    "- not knowing whether to do one thing or another\n" +
    "- doing something before they could stop themselves\n" +
    "- closing the distance\n" +
    "- swallowing hard\n" +
    "- time slowing, or the world falling away";
const FILLER = "suddenly, slowly, slightly, just, really, very, almost, somehow, " +
    "seemed to, began to, found themselves";
const COPY_EXACTLY = {
    id: "hands_off",
    name: "What to copy exactly",
    on: true,
    role: "system",
    text: "<copy_these_exactly>\n" +
        "Some of what you are given is not prose, and none of it is yours to " +
        "improve. Each of these comes through character for character, in the " +
        "place it already sits:\n\n" +
        "- HTML and XML tags, with everything inside the angle brackets\n" +
        "- tokens shaped like [[AR1]], standing in for formatting lifted out " +
        "before you saw it\n" +
        "- code, fenced or inline, and anything in backticks\n" +
        "- links, image links and file paths\n" +
        "- stat blocks, status bars, trackers, inventories, timestamps, and any " +
        "line printed to the same shape every time\n" +
        "- a second language beside the first, with the line translating it: both " +
        "stay as they are, in the order they are in\n" +
        "- names as spelled, including odd spellings and capitalisation\n" +
        "- numbers, dates, times and measurements\n\n" +
        "Where you are unsure whether something is prose, treat it as one of these " +
        "and leave it where it is.\n" +
        "</copy_these_exactly>",
};
const JOB_BLOCK = {
    id: "job",
    name: "The job",
    on: true,
    role: "system",
    text: "<your_job>\n" +
        "You are the second pair of eyes on a draft. Two authors are writing this " +
        "story between them, passing it back and forth, and the passage below has " +
        "just been written.\n\n" +
        "What it means is settled, and you are not the one deciding it. Whatever " +
        "happens in the passage still happens. Whoever says something still says " +
        "it, and still means it. It ends on the moment it already ends on. That " +
        "holds however weak a line reads, and it holds when you cannot see why a " +
        "line is there: it is there because your co-author put it there.\n\n" +
        "Your half of this is how it reads. Same story, told better.\n" +
        "</your_job>",
};
const CUT_THESE = {
    id: "cut",
    name: "What to cut",
    on: true,
    role: "system",
    text: "<what_to_cut>\n" +
        "These are worth losing wherever they turn up:\n\n" +
        PHRASES +
        "\n\nTake out these words where the sentence still stands without them: " +
        FILLER +
        ".\n\n" +
        "Where a sentence restates the one before it in other words, keep " +
        "whichever is doing the work and let the other go. The same for a speech " +
        "tag that explains the line it follows, and for a label on a feeling the " +
        "passage is already showing.\n\n" +
        "When something goes, let the gap close. A passage is usually better one " +
        "sentence shorter.\n" +
        "</what_to_cut>",
};
const MEND_THESE = {
    id: "fix",
    name: "What to mend",
    on: true,
    role: "system",
    text: "<what_to_mend>\n" +
        "Give hands, eyes and breath an owner. Her hand found his becomes she took " +
        "his hand.\n\n" +
        "Where three sentences run to the same length, vary one. Where three " +
        "fragments run together, give one of them a verb.\n\n" +
        "Where three physical details stack on one moment, keep the one that " +
        "carries it.\n\n" +
        "The passage keeps the ending it has. Where the last line reaches for what " +
        "happens next, or turns to your co-author with a question, that reach is " +
        "what to trim.\n" +
        "</what_to_mend>",
};
const LEAVE_ALONE = {
    id: "leave",
    name: "What to leave",
    on: true,
    role: "system",
    text: "<what_to_leave>\n" +
        "A passage that already reads well comes back exactly as it was. " +
        "Rewriting what did not need it costs the most of anything you can do " +
        "here: it takes away a line your co-author chose, and they cannot see what " +
        "moved.\n\n" +
        "A rewrite that came back longer has usually added rather than mended, so " +
        "it is worth a second look before you hand it over.\n\n" +
        "Finding nothing worth changing is a real answer. Hand it back as it is.\n" +
        "</what_to_leave>",
};
// ---- a model that does not reason, short ----
// The rules first, because they are the same on every refine in every chat and
// a provider that caches prompts reuses everything up to the first thing that
// changed. Setting comes after them, the earlier pages after that, and the
// passage last. Ordered the other way round, as this was, the run-up sat near
// the top and every rule below it counted as new on every single turn.
const PLAIN_SHORT = [
    JOB_BLOCK,
    CUT_THESE,
    MEND_THESE,
    LEAVE_ALONE,
    COPY_EXACTLY,
    HOW_TO_ANSWER,
    ...SCENE_BLOCKS,
    RECENT_BLOCK,
    TURN_BLOCK,
];
// ---- a model that does not reason, in full ----
// The same rules, one to a block, each said at length.
const PLAIN_LONG = [
    JOB_BLOCK,
    {
        id: "cut",
        name: "Phrases to cut",
        on: true,
        role: "system",
        text: "<phrases_to_cut>\n" +
            "These turn up in machine-written fiction several times a session and in " +
            "published fiction almost never. Worth losing wherever they appear:\n\n" +
            PHRASES +
            "\n\nLet a phrase go instead of swapping it for a near neighbour. Where " +
            "the moment still needs carrying, carry it with what this person is " +
            "doing in this room; where nothing is happening there, let the line go.\n" +
            "</phrases_to_cut>",
    },
    {
        id: "words",
        name: "Words to cut",
        on: true,
        role: "system",
        text: "<words_to_cut>\n" +
            "These can go wherever the sentence still stands without them: " +
            FILLER +
            ".\n\n" +
            "Take out an adverb that repeats what its verb already said: whispered " +
            "quietly, hurried quickly.\n\n" +
            "Where an intensifier is doing work a stronger word would do alone, use " +
            "the stronger word. Very tired is tired said weakly; exhausted is the " +
            "word.\n" +
            "</words_to_cut>",
    },
    {
        id: "repeats",
        name: "Repetition",
        on: true,
        role: "system",
        text: "<repetition>\n" +
            "Read the passage twice: once for sense, once for what it says twice.\n\n" +
            "The commonest fault in writing like this is a sentence restating the one " +
            "before it in other words. One of the two is doing the work. Keep that " +
            "one and let the other go.\n\n" +
            "Watch for a word used twice in three lines where the second use was " +
            "meant as no echo.\n" +
            "</repetition>",
    },
    {
        id: "rhythm",
        name: "Rhythm",
        on: true,
        role: "system",
        text: "<rhythm>\n" +
            "Read for length before you read for meaning. Three sentences of about " +
            "the same length in a row is a rhythm a reader stops hearing: vary one " +
            "of them.\n\n" +
            "A fragment lands once. Three in a row is a tic.\n\n" +
            "A paragraph running past six lines usually holds two paragraphs.\n" +
            "</rhythm>",
    },
    {
        id: "speech",
        name: "Speech",
        on: true,
        role: "system",
        text: "<speech>\n" +
            "Every line keeps its meaning and its speaker. Where phrasing is stiff, " +
            "loosen the phrasing and leave the meaning where it is.\n\n" +
            "Take out the tag that explains its own line: she said angrily, he asked, " +
            "curious. Where the tone is missing from the words, mend the words.\n\n" +
            "Take out speech that repeats back what the other person just did before " +
            "answering it.\n\n" +
            "A character who speaks badly goes on speaking badly. Clipped, rambling, " +
            "plain or crude is a voice, and smoothing it hands back a different " +
            "character.\n" +
            "</speech>",
    },
    {
        id: "bodies",
        name: "Bodies and feeling",
        on: true,
        role: "system",
        text: "<bodies_and_feeling>\n" +
            "Give hands, eyes and breath an owner. Her hand found his becomes she " +
            "took his hand. His eyes traced her face becomes he looked at her.\n\n" +
            "Feeling belongs in what someone does. Where the action already carries " +
            "it, the naming is the part to cut: if she is pulling her coat closed, " +
            "she needs no line saying she felt exposed.\n\n" +
            "One physical detail at a time. Three stacked together is a list, and a " +
            "reader skims a list.\n\n" +
            "A heartbeat, a shiver or a held breath standing in for an emotion is the " +
            "emotion left unwritten. Write what the person does.\n" +
            "</bodies_and_feeling>",
    },
    {
        id: "endings",
        name: "How it ends",
        on: true,
        role: "system",
        text: "<how_it_ends>\n" +
            "The passage ends where it ends. Where the last line reaches for what " +
            "happens next, or turns into a question aimed at your co-author, that " +
            "reach is what to trim.\n\n" +
            "Where it already ends on a hook, keep the hook. The shape of the turn " +
            "belongs to whoever wrote it.\n" +
            "</how_it_ends>",
    },
    LEAVE_ALONE,
    COPY_EXACTLY,
    HOW_TO_ANSWER,
    ...SCENE_BLOCKS,
    RECENT_BLOCK,
    TURN_BLOCK,
];
const THINKS_JOB = {
    id: "job",
    name: "The job",
    on: true,
    role: "system",
    text: "<your_job>\n" +
        "You are the second pair of eyes on a draft. Two authors are writing this " +
        "story between them, and the passage below has just been written.\n\n" +
        "Work out what is weak in how it is written, then mend that, and nothing " +
        "else. What it means is settled: whatever happens still happens, whoever " +
        "says something still says it and still means it, and it ends on the " +
        "moment it already ends on. That holds however weak a line reads, and it " +
        "holds when you cannot see why a line is there: it is there because your " +
        "co-author put it there.\n" +
        "</your_job>",
};
const THE_STANDARD = {
    id: "standard",
    name: "The standard",
    on: true,
    role: "system",
    text: "<the_standard>\n" +
        "One question decides every line: could this sentence sit in any story, or " +
        "only in this one?\n\n" +
        "A sentence that could sit anywhere is the one to work on. Put in its " +
        "place what is true of this person, in this room, now. Where nothing is " +
        "true there, let the line go and leave the gap closed.\n\n" +
        "Ask it of speech, of gesture, of description, and ask it of your own " +
        "rewrite before you answer.\n" +
        "</the_standard>",
};
const RESTRAINT = {
    id: "restraint",
    name: "Restraint",
    on: true,
    role: "system",
    text: "<restraint>\n" +
        "A passage that already reads well comes back exactly as it was.\n\n" +
        "Length is rarely the improvement. Shorter with nothing wasted is the " +
        "answer more often than not.\n" +
        "</restraint>",
};
// The prompt for your own passages. A different job: your writing is already in
// your hand, and the failure to watch for is a refine that hands it back in the
// narrator's.
const YOURS_DEFAULT = [
    {
        id: "job",
        name: "The job",
        on: true,
        role: "system",
        text: "<your_job>\n" +
            "Your co-author has written the passage below. Tidy how it reads and " +
            "leave the writing to them.\n\n" +
            "Everything they did, said and meant stays. Where you find yourself " +
            "about to add an action, a line of speech or a reaction they left out, " +
            "that is the moment to stop: their turn belongs to them.\n" +
            "</your_job>",
    },
    {
        id: "voice",
        name: "Their hand",
        on: true,
        role: "system",
        text: "<their_hand>\n" +
            "This is your co-author writing, and their hand is not the narrator's. " +
            "Keep it.\n\n" +
            "Short plain lines stay short and plain. Lower case stays lower case. " +
            "Present tense stays present tense, and first person stays first person. " +
            "A passage handed back in polished third person is one they will read as " +
            "somebody else's.\n\n" +
            "Their length is their choice: a one line passage stays a one line " +
            "passage.\n" +
            "</their_hand>",
    },
    {
        id: "fix",
        name: "What to mend",
        on: true,
        role: "system",
        text: "<what_to_mend>\n" +
            "Typing slips, missing words, and a word plainly meant to be another " +
            "one.\n\n" +
            "Punctuation and capitalisation, where they came out that way by " +
            "accident. Where lower case is the style, it stays.\n\n" +
            "A sentence tangled enough to be hard to follow: say the same thing in " +
            "the same hand, more clearly.\n\n" +
            "That is the whole list. Their word choice, their level of detail and " +
            "their plain lines are theirs, and they come back as they went in.\n" +
            "</what_to_mend>",
    },
    COPY_EXACTLY,
    HOW_TO_ANSWER,
    ...SCENE_BLOCKS,
    RECENT_BLOCK,
    TURN_BLOCK,
];
// ---- a model that reasons, short ----
const THINKS_SHORT = [
    THINKS_JOB,
    THE_STANDARD,
    RESTRAINT,
    COPY_EXACTLY,
    THINKS_ANSWER,
    ...SCENE_BLOCKS,
    RECENT_BLOCK,
    TURN_BLOCK,
];
// ---- a model that reasons, in full ----
// The same standard, plus where to point it and a pass over its own answer.
const THINKS_LONG = [
    THINKS_JOB,
    THE_STANDARD,
    {
        id: "where",
        name: "Where to look",
        on: true,
        role: "system",
        text: "<where_to_look>\n" +
            "Five places account for most of what goes wrong in writing like this. " +
            "Check each before deciding the passage is finished.\n\n" +
            "The second sentence. It often restates the first in other words. One of " +
            "the two is doing the work.\n\n" +
            "The body. Hands and eyes acting alone, a pulse standing in for a " +
            "feeling, three physical details where one would land.\n\n" +
            "The speech tag. Where it explains the tone, the line under it is " +
            "carrying too little.\n\n" +
            "The stock phrase. A held breath, a hammering heart, a whisper, a " +
            "shiver, air thick with something. These arrive by habit.\n\n" +
            "The last line. A passage ending by pointing at what comes next is " +
            "asking the other author to do the work.\n" +
            "</where_to_look>",
    },
    {
        id: "voice",
        name: "Voice",
        on: true,
        role: "system",
        text: "<voice>\n" +
            "The passage has a voice, and yours is a different one. Mend what is weak " +
            "in the voice that is there and hand it back still sounding like itself.\n\n" +
            "This matters most with a character who speaks badly on purpose: " +
            "clipped, rambling, plain, crude. Smoothing that hands back a different " +
            "character.\n" +
            "</voice>",
    },
    RESTRAINT,
    {
        id: "check",
        name: "Before you answer",
        on: true,
        role: "system",
        text: "<before_you_answer>\n" +
            "Read your rewrite against the original once more and answer two " +
            "questions.\n\n" +
            "Did anything happen in yours that did not happen in theirs? Take it " +
            "out.\n\n" +
            "Is yours longer? Find what you added and decide whether it earns the " +
            "room. It usually does not.\n" +
            "</before_you_answer>",
    },
    COPY_EXACTLY,
    THINKS_ANSWER,
    ...SCENE_BLOCKS,
    RECENT_BLOCK,
    TURN_BLOCK,
];
const DEFAULT_BLOCKS = PLAIN_SHORT;
const BUILT_IN_PROMPTS = [
    {
        name: "A quick read",
        blocks: PLAIN_SHORT,
        thinking: "off",
        what: "The one to start with. What to cut, what to mend, what to leave, a block each. The smaller of the two prompts that work on any model.",
    },
    {
        name: "A close read",
        blocks: PLAIN_LONG,
        thinking: "off",
        what: "The same ground, gone over properly: phrases, words, repetition, rhythm, speech, bodies, endings, one block apiece. Half again the prompt on every refine, and followed more closely. Works on any model.",
    },
    {
        name: "A quick read, for a model that thinks",
        blocks: THINKS_SHORT,
        thinking: "inherit",
        what: "One question, and the room to answer it: could this sentence sit in any story, or only in this one? The smallest prompt of the four, because a model that reasons works the rest out. Needs a model that reasons.",
    },
    {
        name: "A close read, for a model that thinks",
        blocks: THINKS_LONG,
        thinking: "inherit",
        what: "The same question, plus the five places worth looking, keeping the writer's voice, and a pass back over its own answer. About the size of a quick read on a plain model, and it goes deeper for it. Needs a model that reasons.",
    },
];
const BUILT_IN = BUILT_IN_PROMPTS.map((p) => p.name);
// The prompt it starts on is one of the four, and which one is worth saying
// out loud. Back to the default and a fresh install both land here, and
// "the default" on its own does not tell you what you are about to get.
const DEFAULT_PROMPT_NAME = (BUILT_IN_PROMPTS.find((p) => p.blocks === DEFAULT_BLOCKS) || BUILT_IN_PROMPTS[0]).name;
// What a prompt actually is, as one string, so two of them can be told apart.
// Names are left out, since renaming a block changes nothing that is sent, and
// so are blocks switched off, since those are not sent either.
const promptShape = (raw) => (Array.isArray(raw) ? raw : [])
    .filter((b) => b && typeof b === "object" && b.on !== false)
    .map((b) => String(b.role || "system") + "\u0001" + String(b.text == null ? "" : b.text).trim())
    .join("\u0002");
// The four never change, so their shapes are worked out once. Doing it on every
// repaint meant rebuilding twenty thousand characters of prompt to answer a
// question whose answer had not moved.
const BUILT_IN_SHAPES = BUILT_IN_PROMPTS.map((p) => ({
    name: p.name,
    shape: promptShape(p.blocks),
}));
const ROLE_OPTIONS = [
    { value: "system", label: "System" },
    { value: "user", label: "User" },
    { value: "assistant", label: "Assistant" },
];
// The sampler values that reach the request. Anything not on this list is not
// passed on, on either side of the bridge. Blank means the connection decides,
// which is why none of these carry a default.
// Patterns of the reader's own, on top of the built-in ones. Added rather than
// replacing: replacing is how somebody ends up with one pattern of their own,
// none of the defaults, and a rewrite that ate a code block. What a particular
// card needs is nearly always one more shape, not a different set.
const SHIELD_FIELDS = [
    {
        key: "shieldAdd",
        label: "Patterns of your own to hide",
        type: "lines",
        needs: { key: "protectOn" },
        under: true,
        hint: "Optional, one regular expression per line, matched without case. Code, links, images, comments, entities, wiki brackets, spoiler bars, table rows and any tag carrying an attribute are covered already. Yours are tried first, and one that will not compile is named under this box.",
    },
    {
        key: "shieldKeep",
        label: "Patterns to keep visible",
        type: "lines",
        needs: { key: "protectOn" },
        under: true,
        hint: "Optional, one per line. A region matching one of these stays in front of the model even when a rule above would have hidden it, which is how you narrow a built-in rule without losing it.",
    },
];
// The checks on what an answer says, as opposed to how long it is. Each one is
// a shape that was going to be written into somebody's chat, and each is the
// reader's to switch off: somebody writing a story these fire on constantly is
// better served turning one off than turning the extension off.
const GUARD_FIELDS = [
    {
        key: "guardRefusal",
        label: "Refuse an answer that declines the job",
        type: "bool",
        hint: "On by default. Catches an answer where the model says it will not do this. That is the one thing that must never be saved over your reply. Only applies to a short answer: a long one that happens to contain the words is a scene, not a refusal.",
    },
    {
        key: "guardPreamble",
        label: "Refuse an answer that talks about the edit",
        type: "bool",
        hint: "On by default. Catches an answer opening with something like \u201cHere is the rewritten message\u201d. With the tags doing their job this rarely fires, because a preamble outside them is ignored, not saved.",
    },
    {
        key: "guardSoften",
        label: "Refuse a rewrite that sanitised the reply",
        type: "bool",
        hint: "On by default, and the only check that reads the original as well as the rewrite. It compares the charged language in the two and refuses a rewrite that dropped most of it.",
    },
    {
        key: "softenPct",
        label: "How much of it may go",
        type: "num",
        min: 10,
        max: 100,
        needs: { key: "guardSoften" },
        under: true,
        hint: "As a percentage of the charged words that were in the reply. 60 by default, so losing more than three in five counts as sanitising and losing one or two reads as an ordinary edit. Lower is stricter.",
    },
    {
        key: "softenWords",
        label: "Words of your own to watch",
        type: "lines",
        needs: { key: "guardSoften" },
        under: true,
        hint: "Optional, one per line, added to the built-in list. That list holds only words that are hard to use innocently, so add what softening looks like in what you write.",
    },
    {
        key: "skipWhenClean",
        label: "Skip the automatic pass when a scan finds nothing",
        type: "bool",
        hint: "Off by default. The reply is scanned here in the extension before the automatic pass calls a model, and nothing on the list means no call. A clean scan means nothing on the list, never nothing wrong.",
    },
    {
        key: "retryRefine",
        label: "Ask again when a check fails",
        type: "num",
        min: 0,
        max: 3,
        hint: "How many extra times to ask, and 0 by default. Only the failures a second try could fix are retried, and every retry is another call on your bill.",
    },
];
// What the floating button offers once it is switched on. Kept out of the main
// list so they appear under it rather than beside it.
const WIDGET_FIELDS = [
    {
        key: "widgetSize",
        label: "How big it is",
        type: "num",
        min: 28,
        max: 96,
        needs: { key: "widgetOn" },
        under: true,
        hint: "In pixels across, the same range Auto Retry's floating button uses. 44 by default, which is about a comfortable thumb. Larger is easier to hit on a phone, smaller keeps it out of the way. Changing it rebuilds the button.",
    },
    {
        key: "widgetUndo",
        label: "One tap puts the last refine back",
        type: "bool",
        needs: { key: "widgetOn" },
        under: true,
        hint: "Off by default. On, a tap puts the last refine back whenever there is one, so refining again means holding the button for the menu. The undo is on the card and beside the message either way.",
    },
];
const SAMPLER_FIELDS = [
    {
        id: "temperature",
        label: "Temperature",
        min: 0,
        max: 2,
        step: "0.05",
        hint: "How loose the wording is. A rewrite usually wants this lower than the one you roleplay with.",
    },
    { id: "top_p", label: "Top P", min: 0, max: 1, step: "0.01", hint: "" },
    { id: "top_k", label: "Top K", min: 0, max: 500, step: "1", hint: "" },
    { id: "min_p", label: "Min P", min: 0, max: 1, step: "0.01", hint: "" },
    {
        id: "max_context",
        label: "Context size (tokens)",
        min: 512,
        max: 2000000,
        step: "1",
        hint: "How much the provider is told it may read. Blank leaves that to the connection, which is nearly always right: a refine is a small request next to a chat.",
    },
    {
        id: "max_tokens",
        label: "Longest answer (tokens)",
        min: 1,
        max: 200000,
        step: "1",
        hint: "A ceiling low enough to cut the rewrite off mid-sentence gets it dropped for being too short, so leave room.",
    },
    { id: "frequency_penalty", label: "Frequency penalty", min: -2, max: 2, step: "0.05", hint: "" },
    { id: "presence_penalty", label: "Presence penalty", min: -2, max: 2, step: "0.05", hint: "" },
    { id: "repetition_penalty", label: "Repetition penalty", min: 0, max: 2, step: "0.05", hint: "" },
];
const COST_FIELDS = [
    {
        key: "connectionId",
        label: "Refine using",
        type: "pick",
        options: [{ value: "", label: "The model I am chatting with" }],
        hint: "A rewrite does not need the model you roleplay with. Pointing this at a cheaper or faster connection is the biggest saving there is here.",
    },
    {
        key: "thinkingMode",
        label: "Let it think first",
        type: "pick",
        options: [
            { value: "off", label: "No, keep it quick" },
            { value: "inherit", label: "Whatever my connection is set to" },
            { value: "custom", label: "Yes, and I will say how much" },
        ],
        hint: "Off by default. Rewriting a paragraph is not a reasoning problem, and extended thinking on every reply is the cost nobody notices until the bill arrives. The middle one sends nothing at all, which is what leaves your own reasoning settings in charge.",
    },
    {
        key: "thinkingEffort",
        label: "How much thinking",
        type: "pick",
        needs: { key: "thinkingMode", is: "custom" },
        under: true,
        options: [
            { value: "auto", label: "Auto, whatever the provider does" },
            { value: "none", label: "None" },
            { value: "minimal", label: "Minimal" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "xhigh", label: "Extra high" },
            { value: "max", label: "Max" },
        ],
        hint: "Only used when you picked the last option above. What each level means is the provider's business, and one that does not take an effort level ignores it. A rewrite rarely needs more than low.",
    },
    {
        key: "timeoutSecs",
        label: "Give up waiting after (seconds)",
        type: "num",
        min: 0,
        max: 3600,
        hint: "A refine that has not come back by then is cancelled and the reply is left alone. Up to an hour, and 0 means never give up.",
    },
];
const LIMIT_FIELDS = [
    {
        key: "maxGrowthPct",
        label: "Longest a rewrite may get (%)",
        type: "num",
        min: 0,
        max: 500,
        hint: "A rewrite this much longer has written new scene instead of polishing what was there. 0 allows any length.",
    },
    {
        key: "minShrinkPct",
        label: "Shortest a rewrite may get (%)",
        type: "num",
        min: 0,
        max: 99,
        hint: "A rewrite this much shorter has lost writing instead of tightening it. 0 allows any length.",
    },
    {
        key: "keepOriginal",
        label: "Keep what a refine replaced",
        type: "bool",
        hint: "On by default, and what makes Put it back possible. Held while the page is open and written nowhere.",
    },
    {
        key: "confirmBeforeSave",
        label: "Ask before saving a refine",
        type: "bool",
        hint: "Off by default. On, every refine shows you both versions and waits for a yes.",
    },
    {
        key: "toast",
        label: "Show a pop-up on each refine",
        type: "bool",
        hint: "On by default. Turn it off if you would rather it worked quietly and you watched this tab instead.",
    },
];
// getComputedStyle hands colours back as rgb() or rgba() and nothing else, so
// those forms are the whole of what needs parsing. Anything else is unknown,
// and unknown means leave it alone.
function parseColor(input) {
    const s = String(input == null ? "" : input).trim();
    const m = s.match(/^rgba?\(([^)]+)\)$/i);
    if (!m)
        return null;
    const parts = m[1].replace(/\//g, " ").replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length < 3)
        return null;
    const num = (t, max) => {
        const v = t.indexOf("%") >= 0 ? (parseFloat(t) / 100) * max : parseFloat(t);
        return Number.isFinite(v) ? v : NaN;
    };
    const r = num(parts[0], 255), g = num(parts[1], 255), b = num(parts[2], 255);
    if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b))
        return null;
    let a = 1;
    if (parts.length > 3) {
        const v = num(parts[3], 1);
        a = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    }
    return { r: r, g: g, b: b, a: a };
}
// One colour laid over another, which is what a translucent panel over a
// translucent drawer over the page actually is.
function blendColor(top, under) {
    const a = top.a + under.a * (1 - top.a);
    if (a <= 0)
        return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, u) => (t * top.a + u * under.a * (1 - top.a)) / a;
    return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: a };
}
function relLuminance(c) {
    const f = (v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function contrastRatio(a, b) {
    const x = relLuminance(a), y = relLuminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
// Below this, text is repainted toward white or black, whichever reads better
// on what is behind it.
//
// These are the two numbers the standard actually gives, and the panel used one
// number for both: 3.2, which is the large-text figure applied to 12px labels.
// Everything from 3.2 to 4.5 passed, and that band is exactly where a quiet
// colour on a quiet surface lives, so a timestamp at 3.77 and a button label at
// 4.33 were being called readable. Which number a line gets is decided by its
// own size, since that is what the standard measures.
const TEXT_FLOOR = 4.5;
const BIG_TEXT_FLOOR = 3;
// What counts as large: the standard's 18pt, or 14pt once it is bold.
const BIG_PX = 24;
const BIG_BOLD_PX = 18.66;
// How far past the floor a repair aims. Small on purpose: this is headroom for
// rounding, not a second opinion about what is readable.
const CLEARANCE = 1.05;
function floorFor(cs) {
    const px = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const big = px >= BIG_PX || (weight >= 700 && px >= BIG_BOLD_PX);
    return big ? BIG_TEXT_FLOOR : TEXT_FLOOR;
}
// A filled button whose fill is this close to the surface behind it reads as
// plain text however legible its label is, so it is given an edge instead. Low
// enough that a merely quiet accent is left alone.
const FILL_FLOOR = 1.45;
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const PAGE_FALLBACK = { r: 24, g: 20, b: 34, a: 1 };
// The colour to repaint a failing line, given what is behind it, the ratio it
// has to reach, and the colour it already has.
//
// The smallest step toward white or black that clears the floor, rather than a
// jump to one of them. The panel says things at three volumes on purpose: a
// heading, a label, and a quiet aside underneath. Repainting every failing line
// to the same near-white flattened all three into one, so a hint that only
// needed nudging came out shouting alongside the heading above it. Where the
// existing colour is not known, or where nothing on this surface reaches the
// floor, the most readable there is, which is the old behaviour.
function betterInk(back, want, from) {
    const onWhite = contrastRatio(WHITE, back);
    const onBlack = contrastRatio(BLACK, back);
    const toward = onWhite >= onBlack ? WHITE : BLACK;
    const most = Math.max(onWhite, onBlack);
    // Softened a little, because full white on a dark panel is harsher than
    // anything the theme itself draws. Only while it still clears the floor: the
    // softening costs about a tenth of the ratio, which is what left a button
    // label at 4.46 against 4.5 and the check calling it unreadable. When the
    // softened one falls short the solid colour is used, which is the whole
    // point of repainting in the first place.
    const soft = toward === WHITE
        ? { color: "rgba(255,255,255,0.94)", ink: { r: 255, g: 255, b: 255, a: 0.94 } }
        : { color: "rgba(0,0,0,0.9)", ink: { r: 0, g: 0, b: 0, a: 0.9 } };
    const softRatio = contrastRatio(blendColor(soft.ink, back), back);
    // Cleared with room to spare rather than exactly. Two ways of working out
    // what is behind an element differ in the last decimal, depending on which
    // ancestor is treated as the opaque one, so a repair that lands on 4.53 is a
    // repair somebody else measures at 4.46 and calls a failure. The margin is
    // free: it decides between a black at nine tenths and a black at ten.
    const full = want && softRatio < want * CLEARANCE
        ? { color: toward === WHITE ? "#fff" : "#000", ratio: most }
        : { color: soft.color, ratio: softRatio };
    if (!from || !want || most <= want)
        return full;
    const start = blendColor(from, back);
    for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const mix = {
            r: start.r + (toward.r - start.r) * t,
            g: start.g + (toward.g - start.g) * t,
            b: start.b + (toward.b - start.b) * t,
            a: 1,
        };
        const got = contrastRatio(mix, back);
        if (got >= want)
            return {
                color: "rgb(" + Math.round(mix.r) + "," + Math.round(mix.g) + "," + Math.round(mix.b) + ")",
                ratio: got,
            };
    }
    return full;
}
// What an element is really sitting on. A panel is usually a solid colour with
// the theme's translucent tint laid over it as a gradient, and backgroundColor
// reports only the colour underneath. So the first stop of a gradient is read
// too: these tints are one colour repeated, so the first stop is the whole
// story.
function surfaceOf(el) {
    try {
        const cs = getComputedStyle(el);
        const base = parseColor(cs.backgroundColor);
        const img = String(cs.backgroundImage || "");
        if (img && img !== "none") {
            const stop = img.match(/rgba?\([^)]+\)/i);
            const tint = stop ? parseColor(stop[0]) : null;
            if (tint)
                return base ? blendColor(tint, base) : tint;
        }
        return base;
    }
    catch (_) {
        return null;
    }
}
// Walk up collecting surfaces until one is opaque, then blend them back down.
function backdropOf(el) {
    const stack = [];
    let node = el;
    let hops = 0;
    while (node && hops < 24) {
        const c = surfaceOf(node);
        if (c && c.a > 0) {
            stack.push(c);
            if (c.a >= 0.999)
                break;
        }
        node = node.parentElement;
        hops++;
    }
    let out = stack.length && stack[stack.length - 1].a >= 0.999
        ? stack.pop()
        : PAGE_FALLBACK;
    for (let i = stack.length - 1; i >= 0; i--)
        out = blendColor(stack[i], out);
    return out;
}
// A page of writing with a spark over it. Drawn rather than borrowed so it sits
// at the same weight as the host's own icons, and readable at the size a tab
// gives it: three lines of text, the last one short so it reads as a paragraph
// rather than a list, and a spark for the pass that goes over it.
function undoIcon() {
    return ('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 8h11a5 5 0 0 1 0 10H8" />' +
        '<path d="M6.5 4.5 3 8l3.5 3.5" />' +
        "</svg>");
}
// A ring with a gap, turned by the stylesheet rather than by a timer.
function spinIcon() {
    return ('<svg class="arf-spin" viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
        'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M21 12a9 9 0 1 1-6.2-8.6" />' +
        "</svg>");
}
function refineIcon() {
    return ('<svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
        'stroke="currentColor" stroke-width="1.7" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M4 6.5h11" /><path d="M4 12h9" /><path d="M4 17.5h6.5" />' +
        '<path d="M18.5 3.2l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9z" ' +
        'fill="currentColor" stroke="none" />' +
        '<path d="M17.8 14.6l.55 1.5 1.5.55-1.5.55-.55 1.5-.55-1.5-1.5-.55 1.5-.55z" ' +
        'fill="currentColor" stroke="none" opacity="0.7" />' +
        "</svg>");
}
export function setup(ctx, overrides) {
    const disposers = [];
    const cfg = Object.assign({}, CONFIG);
    function loadSaved() {
        try {
            if (typeof localStorage === "undefined")
                return {};
            const raw = localStorage.getItem(STORE_KEY);
            return raw ? JSON.parse(raw) : {};
        }
        catch (_) {
            return {};
        }
    }
    Object.assign(cfg, loadSaved(), overrides || {});
    // Settings arriving from the account, checked key by key against the shape
    // the default says they should be. The account copy is written by this same
    // extension, but it can be older than this version, half written by a save
    // that failed, or edited by hand, and a panel that cannot be drawn is a worse
    // outcome than a setting that falls back to its default.
    function coerceSaved(s) {
        const out = {};
        if (!s || typeof s !== "object")
            return out;
        for (const key of Object.keys(CONFIG)) {
            if (!(key in s))
                continue;
            const want = CONFIG[key];
            const got = s[key];
            if (key === "blocks" || key === "userBlocks") {
                if (!Array.isArray(got))
                    continue;
                out[key] = got
                    .filter((b) => b && typeof b === "object" && b.id)
                    .slice(0, 40)
                    .map((b) => ({
                    id: String(b.id),
                    on: b.on !== false,
                    role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
                    text: b.text == null ? "" : String(b.text),
                    name: b.name == null ? "" : String(b.name),
                }));
            }
            else if (key === "samplers") {
                if (!got || typeof got !== "object" || Array.isArray(got))
                    continue;
                const clean = {};
                for (const f of SAMPLER_FIELDS) {
                    const v = Number(got[f.id]);
                    if (got[f.id] === "" || got[f.id] == null || !Number.isFinite(v))
                        continue;
                    clean[f.id] = Math.min(f.max, Math.max(f.min, v));
                }
                out.samplers = clean;
            }
            else if (key === "soundUrl") {
                if (typeof got !== "string")
                    continue;
                out.soundUrl = /^data:audio\//.test(got) && got.length <= SOUND_MAX * 2 ? got : "";
            }
            else if (typeof want === "boolean")
                out[key] = !!got;
            else if (typeof want === "number") {
                const v = Number(got);
                if (Number.isFinite(v))
                    out[key] = v;
            }
            else if (typeof want === "string") {
                if (typeof got === "string")
                    out[key] = got;
            }
            else if (Array.isArray(want)) {
                if (Array.isArray(got))
                    out[key] = got.slice(0, 60);
            }
        }
        return out;
    }
    // Saved as it is changed, and pushed to the backend in the same breath. There
    // is no Save button here: a drawer tab has no moment where it closes, so a
    // "nothing sticks until you press Save" contract would have nothing to hang
    // on and would only ever surprise somebody who walked away mid-edit.
    //
    // How long a switch is given to finish moving before anything heavier
    // happens. Two things wait on it: the rebuild that catches the rest of the
    // card up, and the host components below.
    const SETTLE_MS = 260;
    // The floating button, the buttons on each message and the Extras row are all
    // reconciled from here, and all three are the host's own components, so
    // creating or destroying one is the host's own render. Doing that in the
    // frame a switch was clicked in is what makes that switch look slow, and the
    // three switches that turn those components on and off are the only ones
    // that ever pay for it, which is why the master switch lagged and nothing
    // else did. Measured against a host taking 25ms to mount its button: the
    // master switch's knob stood still for two frames and then jumped, while
    // every other switch started moving in six milliseconds.
    //
    // So it happens once the switch has finished moving, and once for however
    // many settings changed together. Nothing is waiting on it: it brings the
    // page into line with settings that are already saved.
    let extrasTimer = null;
    function syncExtrasSoon() {
        if (extrasTimer)
            return;
        extrasTimer = setTimeout(() => {
            extrasTimer = null;
            syncExtras();
        }, SETTLE_MS);
    }
    disposers.push(() => {
        if (extrasTimer)
            clearTimeout(extrasTimer);
        extrasTimer = null;
    });
    // The settings as the backend needs them, which is not quite as they are
    // stored. An untouched prompt is stored as nothing, because writing the whole
    // shipped prompt into storage on a fresh install would make every later
    // change to it invisible to anybody who never edited theirs. The backend
    // cannot work with nothing, so it filled the gap with a copy of its own, and
    // that copy is shorter than the one the panel draws: on a fresh install the
    // prompt shown under Prompt was not the prompt that ran.
    //
    // Resolved here instead. What is sent is what the panel is showing, and the
    // backend's own copy goes back to being what it says it is, the last resort
    // for settings that never arrived at all.
    function forBackend() {
        const out = {};
        for (const k of Object.keys(cfg))
            out[k] = cfg[k];
        const mine = Array.isArray(cfg.blocks) ? cfg.blocks : [];
        const yours = Array.isArray(cfg.userBlocks) ? cfg.userBlocks : [];
        out.blocks = mine.length ? mine : DEFAULT_BLOCKS.map((b) => ({ ...b }));
        out.userBlocks = yours.length ? yours : YOURS_DEFAULT.map((b) => ({ ...b }));
        return out;
    }
    let saveTimer = null;
    function persist(now) {
        const write = () => {
            saveTimer = null;
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
            }
            catch (_) { }
            send({ type: "set_settings", settings: forBackend() });
            // The floating button and the Extras row follow the settings that turn
            // them on, and this is the one place every change passes through. Off
            // this frame, so a switch is not paying for the host's render.
            syncExtrasSoon();
        };
        if (now) {
            if (saveTimer)
                clearTimeout(saveTimer);
            write();
            return;
        }
        // Typing in a rule box should not write on every keystroke. A short settle
        // is enough, and the box also writes on blur, so nothing is lost by
        // wandering off mid-sentence.
        if (saveTimer)
            clearTimeout(saveTimer);
        saveTimer = setTimeout(write, 400);
    }
    // ---- the account copy ----
    // localStorage is a cache: fast, survives being offline, and gone the moment
    // you open a different browser. The account copy is the real one. It is asked
    // for on load, wins when it has anything, and is written on every save.
    //
    // Both halves of this are asked for here and answered in the one backend
    // handler further down, rather than by subscribing a second listener. A
    // second subscriber is one more thing to unsubscribe on teardown, and it
    // assumes the host fans a message out to every listener, which is not
    // something worth depending on for the path that loads your settings.
    let accountAsk = "";
    function loadFromAccount() {
        accountAsk = "arf-load-" + newId();
        send({ type: "load_settings", requestId: accountAsk });
    }
    // The account's answer. Empty means it has nothing yet, and this browser's
    // copy goes up instead: that is the first load after upgrading, and leaving
    // the settings somewhere only this browser can see is what the whole change
    // is about.
    function tookAccountSettings(msg) {
        if (!msg || msg.requestId !== accountAsk)
            return;
        accountAsk = "";
        const s = msg.settings;
        if (s && typeof s === "object" && Object.keys(s).length) {
            Object.assign(cfg, coerceSaved(s));
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
            }
            catch (_) { }
            send({ type: "set_settings", settings: forBackend() });
            syncExtras();
            log("settings loaded from your account", true);
            paint();
            return;
        }
        try {
            if (typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY)) {
                send({ type: "set_settings", settings: forBackend() });
                log("settings moved up to your account", true);
            }
        }
        catch (_) { }
    }
    let chatsOff = [];
    try {
        if (typeof localStorage !== "undefined") {
            const raw = localStorage.getItem(CHATS_OFF_KEY);
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list))
                chatsOff = list.map((x) => String(x)).slice(0, 500);
        }
    }
    catch (_) { }
    const send = (msg) => {
        try {
            if (ctx && typeof ctx.sendToBackend === "function")
                ctx.sendToBackend(msg);
        }
        catch (_) { }
    };
    const newId = () => "arf-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    // Everything the backend knows arrived over the bridge, and a backend that
    // restarts comes back knowing none of it. It cannot look the settings up
    // either: that read runs before any user is known. So this says it all again
    // whenever the backend announces itself.
    function armBackend() {
        send({ type: "set_settings", settings: forBackend() });
        send({ type: "set_chats_off", chats: chatsOff.slice() });
    }
    // ---- state the tab shows ----
    const LOG_MAX = 20;
    const activity = [];
    function log(text, good) {
        activity.unshift({ at: Date.now(), text: String(text), good: !!good });
        while (activity.length > LOG_MAX)
            activity.pop();
        paint();
    }
    let lastChatId = null;
    let lastMessageId = null;
    // Whether something that could actually look has said no chat is open. Not
    // knowing and knowing there is nothing are different states: one is the home
    // screen, the other is the panel waiting to be told where it is.
    let noChatOpen = false;
    let character = null;
    // Read through here rather than off the flag. The chat id is set in several
    // places, and a flag cleared in all but one of them would go stale; pairing
    // the two at the point of reading means "no chat" cannot be believed while a
    // chat is known, whoever forgot to clear it.
    //
    // Nor while the address says otherwise. In the seconds after a chat is made,
    // the server has not caught up and this has no id, but the address already
    // carries one: saying "No chat open" there is the panel stating as fact the
    // one thing it can see is untrue. It says it is working out which chat this
    // is instead, which is what is actually happening.
    const outsideAnyChat = () => noChatOpen && lastChatId == null && idInUrl() == null;
    // ---- knowing which chat you are in ----
    // Walking out to the home screen, or onto a character page, is the move
    // nothing reliably announces. Some builds send CHAT_SWITCHED with a null id
    // and some say nothing at all, and asking the backend does not settle it
    // either: getActive answers with the account's most recent chat, which on the
    // home screen is the chat you just left.
    //
    // Walking back in is the same move in reverse. The watch runs for as long as
    // the panel does, including with no chat open: tapping a character on the
    // home screen opens one, no event names it on some builds, and a watch that
    // stopped when there was nothing to lose track of would miss the one move it
    // is there for. An address that
    // changes while no chat is known is the sign to ask again.
    //
    // The address bar is the one thing in reach that knows. It is read rather
    // than parsed: no assumption about the shape of a Lumiverse URL, only whether
    // the id being held still appears in it. A build whose addresses never carry
    // the id leaves urlNamesChats false and none of this does anything.
    const URL_TICK_MS = 700;
    // An id short enough to appear inside an unrelated address by accident is not
    // evidence of anything, and being wrong here throws away the chat somebody is
    // sitting in.
    const URL_ID_MIN = 8;
    let urlNamesChats = false;
    let urlTimer = null;
    // The address as of the last tick, so a change can be told from a poll.
    let urlWas = "";
    // How many more ticks to keep asking after the address moved. Eight is about
    // six seconds, which covers a chat the server has not caught up with without
    // turning the home screen into a poll.
    const CHASE_TICKS = 8;
    let chasing = 0;
    // Ticks between the slow asks that run while the address and this disagree.
    const SLOW_EVERY = 8;
    let slow = 0;
    // The chat walked out of. The backend goes on naming it while you stand on
    // the home screen, since it answers with the account's most recent chat, and
    // this is what lets that one answer be recognised and dropped without
    // dropping the answer for a chat you have genuinely just opened.
    let leftBehind = null;
    const hereUrl = () => {
        try {
            return String(location.href || "");
        }
        catch (_) {
            return "";
        }
    };
    const urlHolds = (id) => {
        const t = id == null ? "" : String(id);
        if (t.length < URL_ID_MIN)
            return false;
        return hereUrl().indexOf(t) >= 0;
    };
    const urlParts = () => {
        try {
            return String(location.pathname || "").split("/").filter(Boolean);
        }
        catch (_) {
            return [];
        }
    };
    // ---- reading the id out of the address ----
    // Asking the server which chat is open cannot answer for a chat that has just
    // been made, and on Lumiverse making one is the only way into a chat with a
    // character: you tap them and the chat comes into being. For a while after
    // that the server's idea of your most recent chat is the one before it, and
    // that answer is correctly thrown out as stale, which left the panel with
    // nothing and saying no chat was open. Walking out and back in fixed it,
    // which is the shape of a race and not of a missing signal.
    //
    // The address knows immediately. What is not known is the shape of a
    // Lumiverse address, and guessing at it is how this sort of thing breaks on
    // somebody else's build. So it is not guessed: while a chat is known and its
    // id is in the address, where the id sits is written down, and that is the
    // only place ever read from afterwards. A build that puts ids somewhere else
    // teaches this the right place on its own; one whose addresses carry no id at
    // all never records a slot and nothing here does anything.
    const SLOT_KEY = "lv-auto-refine:url-slot:v1";
    let urlSlot = (() => {
        try {
            const raw = localStorage.getItem(SLOT_KEY);
            const got = raw ? JSON.parse(raw) : null;
            if (got && typeof got.at === "number" && got.at >= 0)
                return { at: got.at, after: got.after == null ? null : String(got.after) };
        }
        catch (_) { }
        return null;
    })();
    // Learned from a chat we are certain about. Remembered across reloads, so a
    // tab opened on the home screen already knows where to look instead of having
    // to visit a chat first.
    function learnSlot(id) {
        const t = id == null ? "" : String(id);
        if (t.length < URL_ID_MIN)
            return;
        const parts = urlParts();
        const at = parts.indexOf(t);
        if (at < 0)
            return;
        const next = { at: at, after: at > 0 ? parts[at - 1] : null };
        if (urlSlot && urlSlot.at === next.at && urlSlot.after === next.after)
            return;
        urlSlot = next;
        try {
            localStorage.setItem(SLOT_KEY, JSON.stringify(next));
        }
        catch (_) { }
    }
    // The id the address is carrying right now, if it is carrying one where a
    // chat id has been seen before.
    function idInUrl() {
        if (!urlSlot)
            return null;
        const parts = urlParts();
        const got = parts[urlSlot.at];
        if (!got || got.length < URL_ID_MIN)
            return null;
        // The word in front has to match too. Without it, /settings/something-long
        // would read as a chat purely for having a long enough word in the right
        // place, and being wrong here means refining into a chat nobody opened.
        if (urlSlot.after != null && parts[urlSlot.at - 1] !== urlSlot.after)
            return null;
        return got;
    }
    // Whether the address in front of you names this chat. The slot is asked
    // first and the whole address second, so a build that has moved its ids
    // somewhere else is not called wrong for it while the slot catches up.
    function addressHas(id) {
        const want = id == null ? "" : String(id);
        if (!want)
            return false;
        const slotted = idInUrl();
        return (slotted != null && String(slotted) === want) || urlHolds(id);
    }
    // Everything that describes the chat you are in, told you are not in one.
    // The watch is left running: it is now the thing that notices you walking
    // back in.
    function leftTheChat() {
        // The card on the page is about a message in the chat being left, so it
        // goes with it rather than sitting over the home screen offering to put
        // back something you can no longer see.
        dropPop();
        if (lastChatId != null)
            leftBehind = lastChatId;
        noChatOpen = true;
        lastChatId = null;
        lastMessageId = null;
        character = null;
        preview = null;
        paint();
    }
    function startUrlWatch() {
        // Read now and not only on the tick. This runs the moment the browser says
        // which chat is open, which is the one moment the address is certain to
        // agree; a first tick landing after somebody has moved on would read an
        // address without the id and prove nothing.
        if (urlHolds(lastChatId)) {
            urlNamesChats = true;
            learnSlot(lastChatId);
        }
        if (urlTimer)
            return;
        urlWas = hereUrl();
        urlTimer = setInterval(() => {
            const now = hereUrl();
            if (lastChatId != null) {
                if (urlHolds(lastChatId)) {
                    urlNamesChats = true;
                    learnSlot(lastChatId);
                    urlWas = now;
                    return;
                }
                urlWas = now;
                if (!urlNamesChats)
                    return;
                leftTheChat();
                // Moving from one chat straight into another looks the same from here
                // as walking out, so this asks where we ended up, and keeps asking:
                // the chat you moved into can be too new to be the active one.
                chasing = CHASE_TICKS;
                askWhereWeAre();
                return;
            }
            // No chat known. Tapping a character makes one and the address is what
            // says so first, so a change here is the moment to ask. Only a change:
            // standing still on the home screen asks nothing.
            if (now !== urlWas) {
                urlWas = now;
                chasing = CHASE_TICKS;
                askWhereWeAre();
                // What the panel says depends on the address now, and nothing else
                // repaints on the address changing. Without this the state was right
                // and the words on screen were the ones from the home screen, which is
                // the same bug read from a different direction.
                paint();
                return;
            }
            // Asking once is not enough. The chat was made a second ago and the
            // server takes a moment to agree it exists, so the first answer can be
            // wrong whichever way it is asked. A few more over the next few seconds
            // catch it, and then it stops: a person sitting on the home screen is not
            // worth a question every tick.
            if (chasing > 0) {
                chasing--;
                askWhereWeAre();
                return;
            }
            // Except while the address says you are in a chat and this says you are
            // not. That is two sources disagreeing, not a settled state, and giving
            // up on it is how a slow server turns into a panel that stays wrong until
            // you walk out and back in. Slowly, since it is a disagreement to resolve
            // rather than a change to catch.
            //
            // A build whose addresses name no chats gets the same slow asking with
            // nothing to disagree with, because there the backend is the only source
            // there is. It answers "nobody is in a chat" while it is still starting
            // up, which is what it has just done if the extension was updated a
            // second ago, and one such answer used to be the last word: the panel sat
            // on "No chat open" in a chat somebody was reading, and nothing asked
            // again.
            slow++;
            if (slow >= SLOW_EVERY && (idInUrl() != null || urlSlot == null)) {
                slow = 0;
                askWhereWeAre();
            }
        }, URL_TICK_MS);
    }
    function stopUrlWatch() {
        if (!urlTimer)
            return;
        clearInterval(urlTimer);
        urlTimer = null;
    }
    disposers.push(stopUrlWatch);
    let chatAsk = null;
    // What was being asked, because the three questions do not take the same
    // answer.
    //
    //   who    a chat already known, named in the question, so the backend looks
    //          that one up rather than guessing which is active. "Nobody is in a
    //          chat" is not about that chat, and is ignored.
    //   guess  the id the address is carrying, which nothing has confirmed yet.
    //          Taken only if the backend finds a chat under it.
    //   where  which chat is open at all. The only one whose answer may say there
    //          is none.
    let chatAskWhy = "where";
    function askActiveChat(about) {
        const id = newId();
        chatAsk = id;
        chatAskWhy = about == null ? "where" : "who";
        send({ type: "active_chat", requestId: id, chatId: about == null ? null : about });
    }
    // Where am I, asked the best way available. The address is tried first, since
    // it is right the instant a chat is made and the server is not, and the
    // server is asked only when the address has nothing to offer.
    function askWhereWeAre() {
        const fromUrl = idInUrl();
        if (fromUrl != null && String(fromUrl) !== String(leftBehind)) {
            const id = newId();
            chatAsk = id;
            chatAskWhy = "guess";
            send({ type: "active_chat", requestId: id, chatId: fromUrl });
            return;
        }
        askActiveChat();
    }
    // The one place a chat id arrives, whichever event carried it, so the flag,
    // the watch and the panel cannot end up disagreeing.
    function sawChat(id, messageId) {
        if (id == null)
            return;
        const changed = String(id) !== String(lastChatId);
        lastChatId = id;
        noChatOpen = false;
        // Being in a chat means there is nothing left behind to mistake an answer
        // for, including this chat itself if it is the one being walked back into,
        // and nothing left to chase.
        leftBehind = null;
        chasing = 0;
        // A chat we are sure of, with the address showing it: the one moment where
        // the address can be read for what it is rather than searched.
        learnSlot(id);
        if (messageId != null)
            lastMessageId = messageId;
        if (changed) {
            lastMessageId = messageId != null ? messageId : null;
            character = null;
            preview = null;
            // About this chat by name. Asked without one, the backend answers with
            // whichever chat the server thinks is active, which for a chat made a
            // moment ago by tapping a character is none of them yet, and that answer
            // then threw away the id the host had just handed us.
            askActiveChat(id);
        }
        startUrlWatch();
    }
    let busy = false;
    // The refine that can still be undone, per chat. What the tab is really for:
    // seeing what happened to your prose and disagreeing with it.
    // Every refine that can still be put back, newest last, keyed by the chat and
    // the message together, not one per chat: a second refine in the same chat
    // must not take away the way back from the first. The backend
    // keeps the text for thirty of them, so the panel keeps the same number.
    const undoable = new Map();
    const UNDO_MAX = 30;
    const undoKey = (c, m) => String(c) + ":" + String(m);
    // The ones in the chat you are looking at, newest first.
    function undoHere() {
        if (lastChatId == null)
            return [];
        const out = [];
        undoable.forEach((v) => {
            if (String(v.chatId) === String(lastChatId))
                out.push(v);
        });
        return out.sort((a, b) => b.at - a.at);
    }
    // The last refine of your own draft, which the widget can put back the same
    // way it puts a reply back. It is not in undoable with the replies because it
    // has no message to be keyed by: a draft is not saved anywhere, and the only
    // copy of what it said is the one held here.
    //
    // Offered only while the box still holds what the refine wrote. Once you have
    // typed over it, putting it back would throw away newer writing than the
    // refine it is undoing, which is the one thing a way back must not do.
    let lastDraft = null;
    // Typing in the box is the one thing that takes the way back away, and
    // nothing else would redraw the button to say so: the clock that repaints it
    // runs only while a refine is in flight, and this is the state after one has
    // finished. Watched rather than polled, on the box the refine wrote to, and
    // the listener comes off the moment there is nothing left to watch for.
    let draftWatch = null;
    function unwatchDraft() {
        if (!draftWatch)
            return;
        try {
            draftWatch();
        }
        catch (_) { }
        draftWatch = null;
    }
    disposers.push(unwatchDraft);
    function watchDraft(node) {
        unwatchDraft();
        if (!node || typeof node.addEventListener !== "function")
            return;
        const onType = () => {
            // Asking rather than comparing here: draftBack is the one place that
            // decides whether the way back still stands, and it clears itself.
            if (!draftBack()) {
                unwatchDraft();
                paintFloat();
                paint();
            }
        };
        node.addEventListener("input", onType);
        draftWatch = () => {
            try {
                node.removeEventListener("input", onType);
            }
            catch (_) { }
        };
    }
    function draftBack() {
        if (!lastDraft)
            return null;
        const box = lastDraft.node || composer();
        if (!box)
            return null;
        if (String(box.value == null ? "" : box.value) !== lastDraft.after) {
            lastDraft = null;
            unwatchDraft();
            return null;
        }
        return lastDraft;
    }
    // The newest thing there is to put back, whichever kind it was. One button
    // cannot mean two things, and "the last refine" is one thing: a reply's or
    // your own, whichever happened last.
    function newestBack() {
        const reply = undoHere()[0];
        const mine = draftBack();
        if (mine && (!reply || mine.at >= reply.at))
            return { kind: "draft", at: mine.at };
        if (reply)
            return { kind: "reply", at: reply.at, one: reply };
        return null;
    }
    function putDraftBack() {
        const mine = draftBack();
        if (!mine)
            return;
        const box = mine.node || composer();
        if (box && setComposer(box, mine.before)) {
            lastDraft = null;
            unwatchDraft();
            log("put your draft back", true);
            toast("Your draft is back as it was.");
        }
        else
            toast("Could not write to the input box.", true);
        paintFloat();
        paint();
    }
    let connections = [];
    let tryResult = null;
    let tryBusy = false;
    // The status line's own nodes, so the running clock can be written into them
    // without repainting the panel around whatever somebody is typing in.
    let liveEls = null;
    let clock = null;
    let runStartedAt = 0;
    let lastRun = null;
    // Counts for the Log tab. Session only: this answers "is it doing anything",
    // not "what did it do last week".
    const tally = { saved: 0, dropped: 0, undone: 0 };
    const drops = new Map();
    // The model's working, in two places, because it is two different things.
    //
    // What is being written this second belongs on the card on screen, and it is
    // gone the moment that card is replaced by what the refine did: a second of
    // reading, and then the before and after lands on top of it. So the working
    // is also kept, and the Log is where it is kept, which is a place you can go
    // back to at your own pace rather than one you have to catch.
    //
    // Only a refine that finished replaces what is kept. Starting one and then
    // changing your mind about it should not cost you the working from the refine
    // before it, and a stop is exactly that.
    let liveNotes = "";
    let keptNotes = null;
    // The whole answer, when the message carries one. Every ending sends it, and
    // it is the better copy of what the stream was showing a trimmed tail of.
    //
    // Only if there is working in it. A prompt that asks for none still gets an
    // answer, and that answer is the rewrite: taking it would put the rewrite
    // itself under What the model worked out, which is neither what the card says
    // nor what anybody is looking for there. The streamed notes are the working
    // already, cut out of the tags by the backend, so they are taken where they
    // arrive rather than here.
    function tookNotes(msg) {
        if (!msg || typeof msg.notes !== "string" || !msg.notes.trim())
            return;
        if (!NOTES_TAG.test(msg.notes))
            return;
        liveNotes = msg.notes;
    }
    // The working as it reads, rather than as it was written.
    //
    // What arrives while the model is still writing has already had the tags
    // around it taken off by the backend. What arrives at the end is everything
    // outside <REFINED>, which is the same working with <REFINE_NOTES> still
    // wrapped round it, so the same notes read as prose in one place and as
    // markup in the other. Taken off here, for both, so the working reads the
    // same wherever it is shown.
    const TAG = /<\/?[A-Za-z][\w:.-]*(?:\s[^>]*?)?\/?>/g;
    const NOTES_BODY = /<\s*refine_notes\s*>([\s\S]*?)(?:<\s*\/\s*refine_notes\s*>|$)/i;
    function readable(text) {
        const said = String(text || "");
        // The working alone, read back out of its own tags, with the rewrite left
        // where it belongs: on the card, marked against what it replaced.
        const hit = NOTES_BODY.exec(said);
        return String(hit ? hit[1] : said)
            .replace(TAG, "")
            // A tag on a line of its own leaves the line behind it.
            .replace(/[ \t]+$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }
    function keepNotes(about) {
        const said = liveNotes.trim();
        if (!said)
            return;
        keptNotes = {
            text: said,
            at: Date.now(),
            chatId: about.chatId,
            messageId: about.messageId,
            ok: about.ok,
            why: String(about.why || ""),
            mine: !!about.mine,
        };
    }
    const DROPS_MAX = 20;
    function countDrop(why) {
        const k = String(why || "no reason given").slice(0, 80);
        drops.set(k, (drops.get(k) || 0) + 1);
        while (drops.size > DROPS_MAX)
            drops.delete(drops.keys().next().value);
    }
    let preview = null;
    let previewBusy = false;
    let previewWaiting = null;
    let previewRaw = false;
    let soundSaid = null;
    let nameWithheld = false;
    // Null until the backend has answered. Not knowing and knowing nothing is
    // granted are different, and showing six refusals because the answer has not
    // arrived yet would be a lie the reader acts on.
    let granted = null;
    let permsAsk = null;
    function askPermissions() {
        const id = newId();
        permsAsk = id;
        send({ type: "get_permissions", requestId: id });
    }
    const hasPerm = (id) => !granted || granted.indexOf(id) >= 0;
    function missing() {
        const have = granted;
        if (!have)
            return [];
        return PERMS.filter((p) => have.indexOf(p.id) < 0);
    }
    let widgetFailed = false;
    const SOUND_MAX = 512 * 1024;
    // The clock under the status line. Runs only while something is in flight,
    // and writes one number rather than rebuilding the panel.
    // What the run is doing right now, named rather than left at "busy". Without
    // a stage a refine that takes forty seconds looks the same as one that has
    // quietly failed, and a model that streams looks the same as one that has not
    // started.
    let stage = "";
    let streamed = 0;
    // How long a refine is given, in seconds, or 0 for as long as it takes. One
    // reading of the setting, because the countdown on screen and the watchdog
    // behind it disagreeing about it is how a panel says "12s left" and then
    // waits another two minutes.
    function waitCap() {
        const n = Number(cfg.timeoutSecs);
        if (!Number.isFinite(n))
            return 90;
        return n <= 0 ? 0 : Math.min(3600, Math.max(5, n));
    }
    function stageWords() {
        const secs = runStartedAt ? (Date.now() - runStartedAt) / 1000 : 0;
        const clockPart = secs >= 1 ? ", " + secs.toFixed(0) + "s" : "";
        if (stage === "thinking")
            return "Thinking" + clockPart;
        if (stage === "writing")
            return "Writing" + (streamed ? ", " + streamed.toLocaleString() + " characters" : "") + clockPart;
        if (stage === "checking")
            return "Checking the answer" + clockPart;
        // Which try this is, because a refine that quietly takes three times as
        // long reads as broken unless it says why.
        if (stage === "retrying")
            return ("That answer failed a check, asking again" +
                (retryAt ? " (" + retryAt + " of " + retryOf + ")" : "") +
                clockPart);
        // How long the reader said to wait, so a slow one reads as slow rather
        // than as stuck. With the wait switched off there is nothing to count down
        // to, and a countdown that never ran out would be a lie either way.
        const cap = waitCap();
        if (!cap)
            return "Refining" + clockPart;
        const left = Math.max(0, cap - secs);
        return "Refining" + clockPart + (secs > 8 ? ", " + left.toFixed(0) + "s left" : "");
    }
    // The last line of defence. Everything else can fail politely; this catches
    // the case where nothing comes back at all, which is what a crashed backend
    // or a dropped bridge message looks like from here. Without it the panel
    // spins until the page is reloaded.
    // A backend that is not running answers nothing at all, and the deadman below
    // only notices that a whole timeout later: with the default settings the
    // panel spun for a hundred and five seconds before saying a word.
    //
    // The backend says it has the request the moment it arrives, before any work.
    // That message was already being sent and thrown away here. Waiting a few
    // seconds for it separates "the extension is not loaded" from "the model is
    // slow", which are the two things a spinning panel could mean and the reader
    // cannot tell apart.
    let ackTimer = null;
    const ACK_MS = 5000;
    function armAck() {
        if (ackTimer)
            clearTimeout(ackTimer);
        ackTimer = setTimeout(() => {
            ackTimer = null;
            if (!busy && !sweep)
                return;
            // A sweep that never got its first word back is the same fault and needs
            // the same clearing up, or its counter sits at nought of nought with a
            // Stop button that has nothing to stop.
            sweep = null;
            sweepAsk = null;
            markBusy(false);
            const why = "this extension's backend did not answer, so nothing was sent to a model";
            tally.dropped++;
            countDrop(why);
            lastRun = { ms: lastRunMs, ok: false, why: why };
            log("no answer from the backend. Check that Auto Refine is fully installed.");
            toast("Auto Refine's backend is not answering. Nothing was refined.", true);
            paint();
        }, ACK_MS);
    }
    function clearAck() {
        if (ackTimer)
            clearTimeout(ackTimer);
        ackTimer = null;
    }
    // A sweep says which message it is on before starting it, so silence for
    // longer than one message could take means the run itself went missing rather
    // than the model being slow. Set again on every message. With the wait
    // switched off there is no "longer than one message could take", so there is
    // nothing to watch for and this stays out of the way.
    let sweepWatch = null;
    function armSweepWatch() {
        if (sweepWatch)
            clearTimeout(sweepWatch);
        sweepWatch = null;
        const cap = waitCap();
        if (!cap)
            return;
        sweepWatch = setTimeout(() => {
            sweepWatch = null;
            if (!sweep)
                return;
            const got = sweep;
            sweep = null;
            sweepAsk = null;
            log("the run through the chat stopped answering after reply " + got.at + " of " + got.of);
            toast("The run through the chat stopped answering. What it had already saved is kept.", true);
            paint();
        }, (cap + 30) * 1000);
    }
    function clearSweepWatch() {
        if (sweepWatch)
            clearTimeout(sweepWatch);
        sweepWatch = null;
    }
    disposers.push(clearSweepWatch);
    let deadman = null;
    function armDeadman() {
        if (deadman)
            clearTimeout(deadman);
        const cap = waitCap();
        // Nothing to arm when the wait is switched off. Cutting a refine short here
        // would be the panel doing the exact thing that was just switched off, and
        // this is not what catches a backend that is not running: the ack watchdog
        // above does that in five seconds whatever the wait is set to.
        if (!cap)
            return;
        // The backend gives up at the timeout, so this waits a little longer than
        // that: it should only ever fire when the answer itself went missing.
        deadman = setTimeout(() => {
            deadman = null;
            if (!busy)
                return;
            markBusy(false);
            const why = "nothing came back within " + Math.round(cap + 15) + "s";
            tally.dropped++;
            countDrop(why);
            lastRun = { ms: lastRunMs, ok: false, why: why };
            log("gave up waiting: " + why);
            toast("The refine never came back. Nothing was changed.", true);
            paint();
        }, Math.min(3700, Math.max(20, cap + 15)) * 1000);
    }
    disposers.push(() => {
        if (deadman)
            clearTimeout(deadman);
        deadman = null;
        clearAck();
    });
    function markBusy(on, why) {
        if (on && !busy) {
            runStartedAt = Date.now();
            streamed = 0;
            // What is on screen belongs to the refine that is running. What the Log
            // is holding belongs to the last one that finished, and stays until
            // another one does.
            liveNotes = "";
            armDeadman();
            armAck();
        }
        if (!on) {
            clearAck();
            if (deadman) {
                clearTimeout(deadman);
                deadman = null;
            }
        }
        if (!on && busy && runStartedAt)
            lastRunMs = Date.now() - runStartedAt;
        busy = on;
        stage = on ? why || stage || "asking" : "";
        tickLive();
        if (on) {
            if (!clock)
                clock = setInterval(tickLive, 400);
        }
        else if (clock) {
            clearInterval(clock);
            clock = null;
        }
    }
    // The status line as it should read this instant. One definition, used both
    // by the clock that writes it four times a second and by the panel that
    // builds it from nothing.
    //
    // One definition and not two. Worked out separately they disagree while a
    // refine is running, the clock writing "Thinking, 12s" and a repaint writing
    // "Refining a reply", so switching tabs mid-refine flips the line back to the
    // flat wording and the count starts again from whatever the next tick says,
    // which reads as the thing stopping and restarting.
    function liveNow() {
        const st = statusLine();
        return {
            text: busy ? stageWords() : st.text,
            dot: "arf-dot" + (busy ? " arf-busy" : st.tone === "off" ? "" : " arf-live"),
        };
    }
    // Everything that shows a live state, written in place. A repaint once a
    // second would close an open select and take the cursor out of whatever box
    // somebody was typing in.
    function tickLive() {
        try {
            if (liveEls) {
                const now = liveNow();
                liveEls.text.textContent = now.text;
                liveEls.dot.className = now.dot;
            }
        }
        catch (_) { }
        paintFloat();
    }
    let lastRunMs = 0;
    disposers.push(() => {
        if (clock)
            clearInterval(clock);
        clock = null;
    });
    const chatIsOff = (id) => id != null && chatsOff.indexOf(String(id)) >= 0;
    // Chats the host says have no character card on them, which is the temporary
    // chat: a scratch conversation with the model itself, thrown away on the way
    // out. Recorded from the chat rather than from a missing name, because a name
    // can also be missing when the characters permission was refused, and those
    // two are not the same thing to say.
    const cardless = new Set();
    const isTemporary = (id) => id != null && cardless.has(String(id));
    // Everything the panel draws from the chat you are in, in one string. The
    // address is watched on a timer and asks the backend where we are whenever
    // the two disagree, and most of those answers say exactly what the last one
    // said. Rebuilding for one of those is a rebuild nobody asked for, landing
    // in the middle of whatever somebody was reading or typing, which is what a
    // panel that jumps on its own looks like from the outside.
    const chatShape = () => [
        String(lastChatId),
        String(lastMessageId),
        noChatOpen ? "1" : "0",
        String(character),
        nameWithheld ? "1" : "0",
        preview ? "1" : "0",
        isTemporary(lastChatId) ? "1" : "0",
        chatIsOff(lastChatId) ? "1" : "0",
    ].join("|");
    function saveChatsOff() {
        // A temporary chat is filtered out of what gets written down, not out of
        // the list itself. The switch has to hold for the chat that is open, and
        // the backend still has to be told so it leaves that chat alone; but the
        // chat is discarded on the way out and the next one carries a different id,
        // so a remembered entry could never match anything again. It would sit in
        // storage looking like a setting and doing nothing.
        //
        // Filtered here rather than where the switch is flipped, so that later
        // switching an ordinary chat off cannot write the temporary one down
        // alongside it.
        const keep = chatsOff.filter((c) => !cardless.has(c));
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(CHATS_OFF_KEY, JSON.stringify(keep));
        }
        catch (_) { }
        send({ type: "set_chats_off", chats: chatsOff.slice() });
    }
    function setChatOff(id, off) {
        if (id == null)
            return;
        const s = String(id);
        const at = chatsOff.indexOf(s);
        if (off && at < 0)
            chatsOff.push(s);
        else if (!off && at >= 0)
            chatsOff.splice(at, 1);
        while (chatsOff.length > 500)
            chatsOff.shift();
        saveChatsOff();
        paint();
    }
    function toast(text, force) {
        if (!cfg.toast && !force)
            return;
        try {
            if (ctx.ui && typeof ctx.ui.toast === "function") {
                ctx.ui.toast(text);
            }
        }
        catch (_) { }
    }
    // ---- one stylesheet, not a style attribute per element ----
    // Kept in one place so the coarse-pointer rule is a second rule rather than a
    // branch at every call site, and so a tap target grows for a finger without
    // anything asking how wide the screen is. Sizes are pinned in px: the host's
    // font scale is the reader's story text, and chrome that inherits it grows
    // until a section stops fitting on a phone.
    // The cross the browser puts inside a search field, as a shape rather than a
    // glyph, so it can be given a colour.
    const FOCUS_RING = "0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))," +
        "0 0 8px 0 var(--lumiverse-primary-020,rgba(147,112,219,.2))";
    const SEARCH_X = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z'/%3E%3C/svg%3E\")";
    const CSS = ".arf{display:flex;flex-direction:column;gap:14px;padding:14px;box-sizing:border-box;" +
        "font:13px/1.5 var(--lumiverse-font-family,system-ui);color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf *{box-sizing:border-box}" +
        ".arf-h{font-size:11px;letter-spacing:.05em;text-transform:uppercase;" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-note{font-size:12px;line-height:1.45;color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-lab{font-size:12.5px;color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-rule{height:1px;background:var(--lumiverse-border,rgba(147,112,219,.12));margin:2px 0}" +
        ".arf-col{display:flex;flex-direction:column;gap:5px}" +
        // The browser hides a [hidden] element by giving it display:none, and any
        // rule of ours that sets display beats it, because a class beats the user
        // agent's sheet. Every arf-col above is display:flex, so hiding one did
        // nothing at all: the Watch card drew "What it is working out" with an
        // empty box under it on a refine that had no working to show. Said here,
        // once, rather than at each of the places that hide something.
        ".arf [hidden]{display:none!important}" +
        ".arf-sec{display:flex;flex-direction:column;gap:9px}" +
        ".arf-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}" +
        ".arf-between{display:flex;align-items:center;gap:9px;justify-content:space-between}" +
        // Inputs sit on a fill rather than an invented black, and take a neutral
        // border so a theme with a strong accent does not tint every box.
        ".arf-field{width:100%;padding:8px 10px;border-radius:var(--lumiverse-radius,8px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "font:13px/1.5 var(--lumiverse-font-family,system-ui)}" +
        // The mark on a field reached by keyboard. A soft ring in the accent at low
        // alpha, sitting on the field's own edge: a solid 2px outline with an
        // offset draws a second rounded rectangle around every box, which is a halo
        // rather than a focus mark.
        // Auto Retry's ring, to the pixel, so the two extensions mark a focused box
        // the same way. A 2px ring in the accent at low alpha with a short halo
        // behind it.
        //
        // The blur is kept tight on purpose. Sixteen of blur with two of spread
        // paints eighteen past the edge, and the rows here are nowhere near
        // eighteen apart, so it washes over whatever sits above and below and reads
        // as belonging to the row rather than to the box. Eight is far enough to be
        // a glow and short enough to stay inside the field's own gap.
        "input.arf-field:focus,textarea.arf-field:focus{outline:none;" +
        "border-color:var(--lumiverse-primary,rgba(147,112,219,.9));" +
        "box-shadow:" + FOCUS_RING + "}" +
        // The search box gets nothing on focus, not even that border change. It is
        // the first thing on the panel and it is focused the moment anybody uses
        // it, so a mark on it is lit most of the time it is on screen.
        ".arf-field[type=search]:focus,.arf-field[type=search]:focus-visible{outline:none;" +
        "box-shadow:none;border-color:var(--lumiverse-border-neutral,rgba(128,128,128,.15))}" +
        // The browser draws its own clear button inside a search field and takes
        // its colour from the page's colour scheme rather than from any CSS, so on
        // a dark panel it arrives as a white cross: the one thing here that does
        // not follow the theme, because it is the browser's element and not ours.
        // Replacing the glyph with a masked shape lets it take a colour like
        // everything else.
        //
        // The fill is currentColor, the field's own text colour, rather than a
        // theme variable. Naming a variable means naming a fallback, every fallback
        // here is a dark one, and a light theme that set the common colours and not
        // that one would paint a near-white cross on a near-white field. The
        // field's text colour is whatever the theme asked for and the readability
        // sweep has already corrected it if it did not read, so whatever the cross
        // inherits is legible by the time it is used, with nothing to keep in step.
        //
        // Chrome and Safari only. Firefox draws no clear button in a search field,
        // so there is nothing there to restyle and nothing to break.
        ".arf-field[type=search]::-webkit-search-cancel-button{" +
        "-webkit-appearance:none;appearance:none;width:14px;height:14px;cursor:pointer;" +
        "background-color:currentColor;opacity:.6;" +
        "-webkit-mask:" + SEARCH_X + " center/contain no-repeat;" +
        "mask:" + SEARCH_X + " center/contain no-repeat}" +
        ".arf-field[type=search]::-webkit-search-cancel-button:hover{opacity:1}" +
        // A menu you pick from is not a box you type in. It gets nothing: no ring,
        // no glow, and not even a border change, because the menu opening is
        // already the whole of the feedback.
        "select.arf-field:focus,select.arf-field:focus-visible{outline:none;" +
        "box-shadow:none;border-color:var(--lumiverse-border-neutral,rgba(128,128,128,.15))}" +
        // The browser's own up and down arrows on a number box are drawn by the
        // browser rather than the theme, so on a dark panel they arrive as grey
        // chevrons belonging to no design here. The value is typed, and a focused
        // box still steps with the arrow keys.
        ".arf-field[type=number]::-webkit-outer-spin-button," +
        ".arf-field[type=number]::-webkit-inner-spin-button" +
        "{-webkit-appearance:none;appearance:none;margin:0}" +
        ".arf-field[type=number]{-moz-appearance:textfield;appearance:textfield}" +
        "textarea.arf-field{resize:vertical;min-height:64px}" +
        // One transparent pixel of border always present, so giving a button an
        // edge when its fill is too quiet costs no layout.
        ".arf-btn{min-height:32px;padding:7px 12px;border-radius:var(--lumiverse-radius,8px);cursor:pointer;" +
        "font:12.5px var(--lumiverse-font-family,system-ui);border:1px solid transparent;" +
        "background:var(--lumiverse-secondary,rgba(128,128,128,.15));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "transition:background-color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-btn:hover:not(:disabled){background:var(--lumiverse-secondary-hover,rgba(128,128,128,.25))}" +
        // Filled with the accent at a tint, edged with it, and lettered in the
        // theme's own accent text colour, which is the one token a theme defines
        // for exactly this: accent-coloured words on the panel's own background.
        //
        // Not the accent at full strength with the label hardcoded white. That is
        // readable only on a theme whose accent is dark; on one whose accent is
        // light it is white on lavender, left for the contrast sweep to rescue a
        // moment after every repaint. Rescuing it works and still leaves the panel
        // one timing accident from a white label, which is a thing to stop
        // depending on rather than to keep measuring. The floating
        // widget has been drawn this way from the start and has never needed
        // rescuing. Heavier letters and the edge are what make it the loud one now.
        ".arf-btn.arf-primary{background:var(--lumiverse-primary-020,rgba(147,112,219,.2));" +
        "border-color:var(--lumiverse-primary-050,rgba(147,112,219,.5));" +
        "color:var(--lumiverse-primary-text,rgba(186,135,255,.95));font-weight:600}" +
        ".arf-btn.arf-primary:hover:not(:disabled){" +
        "background:var(--lumiverse-primary-050,rgba(147,112,219,.5))}" +
        ".arf-btn:disabled{opacity:.5;cursor:not-allowed}" +
        ".arf-btn:focus-visible{outline:none;box-shadow:" + FOCUS_RING + "}" +
        ".arf-box{-webkit-appearance:none;appearance:none;margin:0;flex:none;position:relative;" +
        "width:38px;height:22px;border-radius:11px;cursor:pointer;" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15));" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.25));" +
        "transition:background-color var(--lumiverse-transition-fast,150ms ease)," +
        "border-color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-box::after{content:\"\";position:absolute;top:50%;left:3px;transform:translateY(-50%);" +
        "width:14px;height:14px;border-radius:50%;" +
        "background:var(--lumiverse-text-muted,rgba(255,255,255,.55));" +
        "transition:left var(--lumiverse-transition-fast,150ms ease)," +
        "background-color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-box:checked{background:var(--lumiverse-primary-020,rgba(147,112,219,.2));" +
        "border-color:var(--lumiverse-primary-050,rgba(147,112,219,.5))}" +
        ".arf-box:checked::after{left:19px;background:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
        ".arf-box:disabled{opacity:.45;cursor:not-allowed}" +
        "@media (prefers-reduced-motion: reduce){.arf-box,.arf-box::after{transition:none}}" +
        ".arf-well{white-space:pre-wrap;line-height:1.5;font-size:12.5px;padding:8px 10px;" +
        "border-radius:var(--lumiverse-radius,8px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15))}" +
        ".arf-well.arf-dim{color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        // What changed, marked on the words rather than left for the reader to
        // find by comparing two paragraphs. Taken out is struck through in the
        // theme's danger colour, put in is the success colour, and anything the
        // rewrite left alone is drawn exactly as the rest of the text: the point is
        // that the changes stand out, and colouring the parts that did not change
        // would be colouring nearly all of it.
        //
        // Colour is not the only mark on either. Somebody who cannot tell the two
        // apart still has the line through one of them, and the words themselves.
        ".arf-cut{color:var(--lumiverse-danger,#ef4444);text-decoration:line-through;" +
        "text-decoration-thickness:1px;opacity:.85}" +
        ".arf-add{color:var(--lumiverse-success,#22c55e)}" +
        ".arf-scroll{max-height:130px;overflow-y:auto}" +
        ".arf-well.arf-tall{max-height:340px}" +
        ".arf-dot{flex:none;width:7px;height:7px;border-radius:50%;" +
        "background:var(--lumiverse-text-dim,rgba(255,255,255,.4))}" +
        ".arf-dot.arf-live{background:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
        ".arf-dot.arf-busy{background:var(--lumiverse-primary,rgba(147,112,219,.9));" +
        "animation:arf-breathe 1400ms ease-in-out infinite}" +
        "@keyframes arf-breathe{0%,100%{box-shadow:0 0 0 0 var(--lumiverse-primary-050,rgba(147,112,219,.5))}" +
        "50%{box-shadow:0 0 0 5px rgba(0,0,0,0)}}" +
        "@media (prefers-reduced-motion: reduce){.arf-dot.arf-busy{animation:none;" +
        "box-shadow:0 0 6px 1px var(--lumiverse-primary-020,rgba(147,112,219,.2))}}" +
        ".arf-when{flex:none;font-variant-numeric:tabular-nums;" +
        "color:var(--lumiverse-text-dim,rgba(255,255,255,.4))}" +
        // ---- the fold, as a box rather than a line of text ----
        // A heading you can click looks like a heading until you click it. Given an
        // edge, a fill and a caret that turns, it looks like a thing that opens,
        // which is the whole job.
        ".arf-fold{display:flex;align-items:center;gap:8px;cursor:pointer;user-select:none;" +
        "width:100%;text-align:left;min-height:34px;padding:7px 10px;" +
        "border-radius:var(--lumiverse-radius-sm,5px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill-subtle,rgba(0,0,0,.1));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "font:12.5px var(--lumiverse-font-family,system-ui);" +
        "transition:background-color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-fold:hover{background:var(--lumiverse-secondary,rgba(128,128,128,.15))}" +
        ".arf-fold:focus-visible{outline:none;box-shadow:" + FOCUS_RING + "}" +
        ".arf-caret{flex:none;font-size:9px;width:9px;" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-foldbody{display:flex;flex-direction:column;gap:11px;padding:2px 2px 4px 10px;" +
        "border-left:1px solid var(--lumiverse-border,rgba(147,112,219,.12));margin-left:5px}" +
        // ---- cards ----
        // Every group of settings gets a box of its own. This is the difference
        // between a panel you can scan and a column of rows you have to read: the
        // eye finds the edge of a box without being told to.
        ".arf-card{display:flex;flex-direction:column;gap:11px;padding:12px;" +
        "border-radius:var(--lumiverse-radius-md,10px);" +
        "border:1px solid var(--lumiverse-border,rgba(147,112,219,.12));" +
        "background:var(--lumiverse-fill-subtle,rgba(0,0,0,.1))}" +
        // The card's own title. Bigger and plainer than the old all-caps label,
        // because at 11px uppercase a heading reads as another muted row.
        ".arf-cardh{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-cardh .arf-note{font-weight:400}" +
        // ---- the tab strip ----
        // Scrolls sideways rather than wrapping. Wrapped tabs move under each other
        // as the panel narrows, and the row you tapped is not where you left it.
        ".arf-tabs{display:flex;gap:2px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;" +
        "border-bottom:1px solid var(--lumiverse-border,rgba(147,112,219,.12))}" +
        ".arf-tabs::-webkit-scrollbar{display:none}" +
        ".arf-tab{flex:none;cursor:pointer;background:none;border:0;border-bottom:2px solid transparent;" +
        "padding:9px 11px;margin-bottom:-1px;white-space:nowrap;" +
        "font:12.5px var(--lumiverse-font-family,system-ui);" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65));" +
        "transition:color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-tab:hover{color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-tab[aria-selected=true]{color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "border-bottom-color:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
        ".arf-tab:focus-visible{outline:none;" +
        "box-shadow:inset 0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
        ".arf-body{display:flex;flex-direction:column;gap:12px}" +
        // A pill for a count or a state, next to a card title.
        ".arf-pill{flex:none;font-size:11px;padding:2px 7px;border-radius:999px;" +
        "background:var(--lumiverse-secondary,rgba(128,128,128,.15));" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        // One block in the prompt list. Indented and edged so eight of them read as
        // a list of things rather than as twenty-four loose rows.
        ".arf-block{display:flex;flex-direction:column;gap:7px;padding:9px 10px;" +
        "border-radius:var(--lumiverse-radius-sm,5px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15))}" +
        // Dimmed the moment it is switched off, and not faded. A block holds a box
        // of prose, thousands of characters of it, and animating the opacity of
        // anything holding text has the browser composite the whole of it for the
        // duration: the text is rasterised a different way while it travels and
        // then put back, which reads as the words shivering.
        ".arf-block.arf-hushed{opacity:.55}" +
        ".arf-mini{min-height:28px;width:32px;padding:0;font-size:13px;line-height:1}" +
        ".arf-btn.arf-mini2{min-height:26px;padding:3px 10px;font-size:11.5px}" +
        // Two choices side by side, where a menu would be heavier than the choice.
        // A row that only exists while the one above it is on. Indented and edged
        // so it reads as belonging to that row rather than as the next setting.
        ".arf-under{padding-left:11px;margin-left:3px;" +
        "border-left:2px solid var(--lumiverse-border,rgba(147,112,219,.12))}" +
        ".arf-seg{display:flex;gap:0;border-radius:var(--lumiverse-radius,8px);overflow:hidden;" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15))}" +
        ".arf-segbtn{flex:1;min-height:32px;padding:7px 10px;cursor:pointer;border:0;" +
        "font:12.5px var(--lumiverse-font-family,system-ui);background:transparent;" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-segbtn[aria-pressed=true]{background:var(--lumiverse-secondary,rgba(128,128,128,.15));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-segbtn:focus-visible{outline:none;" +
        "box-shadow:inset 0 0 0 2px var(--lumiverse-primary-020,rgba(147,112,219,.2))}" +
        "@media (pointer: coarse){.arf-segbtn{min-height:40px}}" +
        // The floating button. Squared against the host's container rather than
        // trusting it, so it is a circle whatever shape the container turns out to
        // be: it was coming out as a squashed oval.
        ".arf-float{width:100%;height:100%;aspect-ratio:1;display:flex;align-items:center;" +
        "justify-content:center;padding:0;cursor:pointer;border-radius:50%;" +
        "border:1px solid var(--lumiverse-border,rgba(147,112,219,.12));" +
        "background-color:var(--lumiverse-card-bg-solid,rgb(24,20,34));" +
        "background-image:linear-gradient(var(--lumiverse-bg-elevated,rgba(35,30,48,.9))," +
        "var(--lumiverse-bg-elevated,rgba(35,30,48,.9)));" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));" +
        "box-shadow:var(--lumiverse-shadow-md,0 8px 24px rgba(0,0,0,.4));" +
        "transition:color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-float:hover{color:var(--lumiverse-primary-text,rgba(186,135,255,.95))}" +
        ".arf-float.arf-back{color:var(--lumiverse-success,#22c55e)}" +
        // Dimmed rather than hidden. The button is how somebody switches the
        // extension off and reaches the tab, so it stays reachable on a screen with
        // nothing to refine; it just stops looking like it is offering a refine.
        ".arf-float.arf-idle{opacity:.5}" +
        ".arf-float.arf-idle:hover{opacity:.75}" +
        ".arf-float.arf-working{color:var(--lumiverse-primary-text,rgba(186,135,255,.95))}" +
        // A ring that breathes while something is running. This is the one piece of
        // movement in the whole extension, and it is here because a floating button
        // is often the only part of it on screen.
        "@keyframes arf-pulse{0%{box-shadow:0 0 0 0 var(--lumiverse-primary-050,rgba(147,112,219,.5))}" +
        "70%{box-shadow:0 0 0 10px rgba(0,0,0,0)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0)}}" +
        ".arf-float.arf-working{animation:arf-pulse 1400ms ease-out infinite}" +
        "@media (prefers-reduced-motion: reduce){.arf-float.arf-working{animation:none}}" +
        "@media (pointer: coarse){.arf-btn.arf-mini2{min-height:34px;padding:6px 12px}}" +
        // The card that comes up on the page when a refine lands, so the answer to
        // "what did it change" is in front of you rather than behind a tab you have
        // to know to open. Bottom right on a desktop, across the bottom on a phone,
        // and never over the message box.
        ".arf-pop{position:fixed;right:12px;bottom:12px;z-index:2147483000;" +
        "width:min(380px,calc(100vw - 24px));max-height:min(70vh,560px);" +
        "display:flex;flex-direction:column;gap:8px;box-sizing:border-box;padding:12px;" +
        "border-radius:var(--lumiverse-radius-lg,12px);" +
        "border:1px solid var(--lumiverse-border,rgba(147,112,219,.12));" +
        "background-color:var(--lumiverse-card-bg-solid,rgb(24,20,34));" +
        "background-image:linear-gradient(var(--lumiverse-bg-elevated,rgba(35,30,48,.96))," +
        "var(--lumiverse-bg-elevated,rgba(35,30,48,.96)));" +
        "box-shadow:var(--lumiverse-shadow-xl,0 20px 60px rgba(0,0,0,.5));" +
        "font-family:var(--lumiverse-font-family,system-ui);font-size:13px;" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9));overflow:hidden;" +
        "animation:arf-rise 180ms ease-out}" +
        "@keyframes arf-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
        // A dim behind it, so the eye goes to the card rather than hunting the page
        // under it for what changed. Light enough to read the chat through, since
        // the card is about a message sitting right there, and a tap anywhere on it
        // closes, which is what everybody expects of a dim.
        ".arf-shade{position:fixed;inset:0;z-index:2147482999;" +
        "background:var(--lumiverse-modal-backdrop,rgba(0,0,0,.45));" +
        "animation:arf-fade 180ms ease-out}" +
        "@keyframes arf-fade{from{opacity:0}to{opacity:1}}" +
        "@media (prefers-reduced-motion: reduce){.arf-shade{animation:none}}" +
        "@media (prefers-reduced-motion: reduce){.arf-pop{animation:none}}" +
        // A row switched on where somebody is already looking. It fades down into
        // place rather than appearing between two frames, which is the difference
        // between a row arriving and the page having flinched.
        ".arf-arrive{animation:arf-arrive 180ms ease-out both}" +
        "@keyframes arf-arrive{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}" +
        "@media (prefers-reduced-motion: reduce){.arf-arrive{animation:none}}" +
        // On a phone it spans the width and sits above the input bar rather than on
        // top of it, so it can be read while you carry on.
        "@media (max-width: 560px){.arf-pop{left:12px;right:12px;bottom:76px;" +
        "width:auto;max-height:68vh}}" +
        // One scroll region, not three. A fixed header over two wells that each
        // scroll on their own means, on a 320px phone, two boxes clipped
        // mid-sentence with nothing to say they hold more, and a scroll inside a
        // scroll inside a page to reach it. The header and the buttons stay put and
        // everything between them scrolls together.
        ".arf-pop-body{flex:1;min-height:0;overflow-y:auto;display:flex;" +
        "flex-direction:column;gap:6px}" +
        ".arf-pop .arf-scroll{max-height:none;overflow:visible}" +
        ".arf-pop-row{flex:none}" +
        ".arf-x{-webkit-appearance:none;appearance:none;background:none;border:0;padding:2px 6px;" +
        "font-size:18px;line-height:1;cursor:pointer;border-radius:var(--lumiverse-radius-sm,5px);" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
        ".arf-x:hover{color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-x:focus-visible{outline:none;box-shadow:" + FOCUS_RING + "}" +
        // The full-screen editor for one block of text.
        ".arf-over{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;" +
        "justify-content:center;padding:16px;box-sizing:border-box;" +
        "background:var(--lumiverse-modal-backdrop,rgba(0,0,0,.6))}" +
        ".arf-bigbox{display:flex;flex-direction:column;gap:10px;width:min(760px,96vw);" +
        "height:min(82vh,700px);box-sizing:border-box;padding:14px;" +
        "border-radius:var(--lumiverse-radius-lg,12px);" +
        "border:1px solid var(--lumiverse-border,rgba(147,112,219,.12));" +
        "background-color:var(--lumiverse-card-bg-solid,rgb(24,20,34));" +
        "background-image:linear-gradient(var(--lumiverse-bg-elevated,rgba(35,30,48,.9))," +
        "var(--lumiverse-bg-elevated,rgba(35,30,48,.9)));" +
        "box-shadow:var(--lumiverse-shadow-xl,0 20px 60px rgba(0,0,0,.5))}" +
        "textarea.arf-bigta{flex:1;min-height:0;resize:none}" +
        // Nothing on focus here, not even the border change the small boxes get.
        // The editor is one box filling the screen, opened on purpose, with
        // nothing to tab between: a mark saying which box has focus answers a
        // question nobody was asking, and at this size it draws a line down the
        // whole window.
        "textarea.arf-bigta:focus,textarea.arf-bigta:focus-visible{outline:none;box-shadow:none;" +
        "border-color:var(--lumiverse-border-neutral,rgba(128,128,128,.15))}" +
        // The button this extension puts on a message and in the input bar. Styled
        // to sit with the host's own icon buttons rather than to stand out: it is
        // one more action in a row of them, not a badge.
        "@keyframes arf-turn{to{transform:rotate(360deg)}}" +
        ".arf-spin{animation:arf-turn 900ms linear infinite;transform-origin:50% 50%}" +
        // A reader who has asked for less movement gets a still icon rather than a
        // spinner, and the button's title still says it is working.
        "@media (prefers-reduced-motion: reduce){.arf-spin{animation:none}}" +
        // ---- saying something is wrong, in the theme's own colours ----
        // Lumiverse has a danger colour and a success colour, and a warning drawn
        // in neither reads as one more muted paragraph. Tinted background, matching
        // edge, text left at full strength so the colour is the signal rather than
        // the thing you have to read through.
        ".arf-warn,.arf-bad,.arf-good{display:flex;gap:8px;align-items:flex-start;" +
        "font-size:12px;line-height:1.45;padding:8px 10px;" +
        "border-radius:var(--lumiverse-radius-sm,5px);border:1px solid;" +
        "color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-warn{border-color:var(--lumiverse-warning,#f59e0b);" +
        "background:color-mix(in srgb,var(--lumiverse-warning,#f59e0b) 12%,transparent)}" +
        ".arf-bad{border-color:var(--lumiverse-danger,#ef4444);" +
        "background:color-mix(in srgb,var(--lumiverse-danger,#ef4444) 12%,transparent)}" +
        ".arf-good{border-color:var(--lumiverse-success,#22c55e);" +
        "background:color-mix(in srgb,var(--lumiverse-success,#22c55e) 12%,transparent)}" +
        // The mark at the front of one. A glyph rather than a coloured dot alone,
        // so the line still says which kind it is to somebody who cannot tell the
        // three colours apart.
        ".arf-sign{flex:none;font-weight:700;line-height:1.45}" +
        ".arf-warn .arf-sign{color:var(--lumiverse-warning,#f59e0b)}" +
        ".arf-bad .arf-sign{color:var(--lumiverse-danger,#ef4444)}" +
        ".arf-good .arf-sign{color:var(--lumiverse-success,#22c55e)}" +
        ".arf-bad-ink{color:var(--lumiverse-danger,#ef4444)}" +
        // A button that throws something away. Edged in the danger colour rather
        // than filled with it: filled, it draws the eye to the one control on the
        // panel that should not be pressed by accident.
        ".arf-btn.arf-danger{border-color:var(--lumiverse-danger,#ef4444);" +
        "color:var(--lumiverse-danger,#ef4444);background:transparent}" +
        ".arf-btn.arf-danger:hover:not(:disabled){" +
        "background:color-mix(in srgb,var(--lumiverse-danger,#ef4444) 14%,transparent)}" +
        // ---- anything that is a log, a count or a piece of a prompt ----
        // The host's own monospace, so a timestamp column lines up, a character
        // count reads as a number, and the text of a prompt looks like the thing
        // that gets sent rather than like prose about it.
        ".arf-mono{font-family:var(--lumiverse-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);" +
        "font-variant-numeric:tabular-nums}" +
        ".arf-well.arf-mono{font-size:12px}" +
        ".arf-grow{flex:1;min-width:0}" +
        // ---- a checkbox comfortable under a mouse is too small for a finger ----
        // The width of the screen does not say which is in use. This asks directly.
        "@media (pointer: coarse){" +
        ".arf-btn{min-height:40px;padding:10px 14px}" +
        ".arf-btn.arf-mini{min-height:40px;width:40px;padding:0}" +
        ".arf-fold{min-height:44px}" +
        ".arf-tab{padding:12px 13px}" +
        ".arf-box{width:46px;height:26px;border-radius:13px}" +
        ".arf-box::after{width:18px;height:18px}" +
        ".arf-box:checked::after{left:23px}" +
        ".arf-field{padding:10px 12px}}";
    let styleEl = null;
    function injectStyle() {
        try {
            if (styleEl || typeof document === "undefined")
                return;
            styleEl = document.createElement("style");
            styleEl.setAttribute("data-arf-style", "1");
            styleEl.textContent = CSS;
            document.head.appendChild(styleEl);
            disposers.push(() => {
                try {
                    styleEl && styleEl.remove();
                }
                catch (_) { }
                styleEl = null;
            });
        }
        catch (_) { }
    }
    // ---- small builders ----
    const el = (tag, cls, text) => {
        const d = document.createElement(tag);
        if (cls)
            d.className = cls;
        if (text != null)
            d.textContent = text;
        return d;
    };
    const heading = (text) => el("div", "arf-h", text);
    const note = (text) => el("div", "arf-note", text);
    function button(label, primary) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "arf-btn" + (primary ? " arf-primary" : "");
        b.textContent = label;
        // Named after what it says, so a rebuild can find the same button again and
        // leave it where your finger already is. A button whose press rewrites the
        // whole prompt is the one that would otherwise be somewhere else by the
        // time the panel comes back.
        b.setAttribute("data-arf-btn", label);
        return b;
    }
    // A line that says something is wrong, or is about to be, or went right.
    // Each carries a glyph as well as a colour, so the three are told apart
    // without relying on being able to tell the three colours apart.
    function notice(kind, text) {
        const box = el("div", "arf-" + kind);
        box.appendChild(el("span", "arf-sign", kind === "good" ? "\u2713" : "!"));
        box.appendChild(el("span", "arf-grow", text));
        return box;
    }
    const warn = (t) => notice("warn", t);
    const bad = (t) => notice("bad", t);
    // ---- the tab ----
    let tab = null;
    let badge = null;
    let transferSaid = null;
    function setBadge(v) {
        // Written only when it changes. This goes to the host on every call, and a
        // panel that repaints on a timer would otherwise say the same thing several
        // times a second.
        if (v === badge)
            return;
        badge = v;
        try {
            tab && tab.setBadge && tab.setBadge(v);
        }
        catch (_) { }
    }
    // A prompt that never shows the model the message is a prompt that cannot do
    // anything, and it is the one mistake the block editor makes possible.
    const holdsTurn = (list) => list.some((b) => b.on && String(b.text || "").indexOf(TURN_MACRO) >= 0);
    // The reply prompt, which is the one the automatic pass and the refine button
    // use. The own-messages prompt is checked where it is edited.
    const noTurn = () => !holdsTurn(blockList("blocks"));
    function statusLine() {
        if (!cfg.enabled)
            return { text: "Off", tone: "off" };
        if (busy)
            return { text: "Refining a reply", tone: "busy" };
        // Said before the rules, because on the home screen a missing rule is not
        // what is stopping anything.
        if (outsideAnyChat())
            return { text: "No chat open", tone: "off" };
        if (chatIsOff(lastChatId))
            return { text: "Off in this chat", tone: "off" };
        if (noTurn())
            return { text: "The prompt is missing {{message}}", tone: "off" };
        if (lastChatId == null)
            return { text: "Waiting for a chat", tone: "off" };
        if (cfg.refineOn)
            return { text: "On, refining every reply", tone: "idle" };
        return { text: "On, waiting for you to press Refine", tone: "idle" };
    }
    // Why the refine button cannot be pressed, or empty when it can. One answer
    // in one place, so the button, its tooltip and the line under it agree.
    function whyNot() {
        if (!cfg.enabled)
            return "Auto Refine is switched off.";
        if (outsideAnyChat())
            return "No chat is open. Open one and this comes back.";
        if (lastChatId == null)
            return "Waiting to be told which chat you are in.";
        if (chatIsOff(lastChatId))
            return "Auto Refine is switched off in this chat.";
        if (noTurn())
            return "No block in your prompt has {{message}} in it, so the model would never see the reply. Add it under Prompt.";
        return "";
    }
    // The draft is not a reply, and what stops one does not all stop the other. A
    // refine of the input box carries no chat id and asks the chat for nothing,
    // so it works while the panel is still working out which chat you are in, and
    // it is not held up by there being no chat at all. Being switched off, here
    // or everywhere, still stops it, and so does a prompt with nowhere to put the
    // text.
    function whyNotDraft() {
        if (!cfg.enabled)
            return "Auto Refine is switched off.";
        if (lastChatId != null && chatIsOff(lastChatId))
            return "Auto Refine is switched off in this chat.";
        if (noTurn())
            return "No block in your prompt has {{message}} in it, so there is nothing to rewrite. Add it under Prompt.";
        return "";
    }
    // Browser-drawn controls are painted from the page's colour scheme, and with
    // none set the browser assumes light, which is why a checkbox comes out as a
    // white block on a dark panel. Measured rather than assumed, so a light theme
    // still gets light controls.
    function setScheme(root) {
        try {
            const back = backdropOf(root);
            root.style.colorScheme = relLuminance(back) > 0.5 ? "light" : "dark";
        }
        catch (_) { }
    }
    // Walk the panel and repair only what genuinely fails. Elements with no text
    // yet are included: a status line waiting for something to say has already
    // been given its colour, and it will not change when the text arrives.
    function sweepReadable(root) {
        try {
            const nodes = [root].concat(Array.prototype.slice.call(root.querySelectorAll("*")));
            for (const n of nodes) {
                const tag = String(n.tagName || "").toLowerCase();
                const isControl = tag === "button" || tag === "input" || tag === "select" || tag === "textarea";
                const hasText = !isControl && n.firstChild && n.firstChild.nodeType === 3;
                const painted = n.getAttribute && n.getAttribute("data-arf-painted") != null;
                if (!isControl && !hasText && !painted)
                    continue;
                const cs = getComputedStyle(n);
                const fg = parseColor(cs.color);
                if (!fg)
                    continue;
                // From the element itself, not its parent. A filled button's label sits
                // on the button's own colour, and measuring it against the card behind
                // instead is how white-on-lavender passed a contrast check and shipped
                // as an unreadable button.
                const back = backdropOf(n);
                const shown = blendColor(fg, back);
                // What this line has to reach depends on how big it is drawn, so it is
                // read off the line rather than being one number for the whole panel.
                const want = floorFor(cs);
                if (contrastRatio(shown, back) < want) {
                    // Prose keeps as much of its own colour as it can: the panel says
                    // things at three volumes on purpose, and repainting a quiet aside to
                    // full white would put it level with the heading above it.
                    //
                    // A control has no such hierarchy to keep. A button label is one
                    // thing at one volume, so the smallest step that scrapes the floor is
                    // the wrong answer there: on a theme with a light accent it left
                    // "Refine the latest reply" as mid-grey on lavender, which reads as
                    // half-erased rather than as readable. Controls get the most readable
                    // ink there is.
                    const ink = isControl ? betterInk(back, want) : betterInk(back, want, fg);
                    n.style.color = ink.color;
                    // Marked so the next repaint re-measures it. Without the mark an
                    // element the sweep already fixed reads as healthy the second time
                    // round, since what it is measuring is the repair. The two kinds of
                    // repair are marked apart because they mean different things: ink
                    // means a theme made its own text unreadable, edge means a fill sits
                    // close to the surface behind it, which the stock theme does on
                    // purpose.
                    try {
                        n.setAttribute("data-arf-painted", "ink");
                    }
                    catch (_) { }
                }
                // A filled button whose fill is close to the surface behind it reads as
                // plain text, however legible the label is. It gets an edge instead of
                // having its label repainted, which would fix the wrong half.
                if (tag === "button") {
                    const fill = surfaceOf(n);
                    const behind = backdropOf((n.parentElement || root).parentElement || root);
                    if (fill && fill.a > 0.05) {
                        const solid = blendColor(fill, behind);
                        if (contrastRatio(solid, behind) < FILL_FLOOR) {
                            n.style.borderColor = "var(--lumiverse-border-hover,rgba(147,112,219,.25))";
                            try {
                                if (n.getAttribute("data-arf-painted") == null)
                                    n.setAttribute("data-arf-painted", "edge");
                            }
                            catch (_) { }
                        }
                    }
                }
            }
        }
        catch (_) { }
    }
    // ---- the tabs ----
    // Six boxes, and everything belongs in exactly one of them. The panel was one
    // column with every setting in it, which reads as a wall however carefully
    // each row is written: nothing tells the eye where one subject ends.
    const TABS = [
        { id: "prompt", label: "Prompt" },
        { id: "context", label: "Context" },
        { id: "model", label: "Model" },
        { id: "limits", label: "Limits" },
        { id: "log", label: "Log" },
        { id: "setup", label: "Setup" },
    ];
    const tabNow = () => (TABS.some((t) => t.id === cfg.tab) ? String(cfg.tab) : "prompt");
    // A box with a title. Everything on a tab goes in one of these, so a group of
    // settings has an edge around it rather than being told apart by spacing.
    function card(title, hint, pill) {
        const c = el("div", "arf-card");
        if (title)
            c.setAttribute("data-arf-card", title);
        if (title) {
            const h = el("div", "arf-cardh");
            h.appendChild(el("span", "arf-grow", title));
            if (pill)
                h.appendChild(el("span", "arf-pill", pill));
            c.appendChild(h);
        }
        if (hint)
            c.appendChild(note(hint));
        return c;
    }
    // Which folds are open, by title, remembered while the page is open.
    const openFolds = new Set();
    function fold(title, fill) {
        const wrap = el("div", "arf-col");
        // Everything is open while a search is running. A setting folded away is
        // still a setting somebody is looking for, and a search that cannot see
        // into a fold quietly answers "no" for half the panel.
        const open = openFolds.has(title) || !!hunt.trim();
        // A real button, so the keyboard and a screen reader get it for free rather
        // than from a role attribute and a keydown handler that has to remember
        // Space as well as Enter.
        const head = document.createElement("button");
        head.type = "button";
        head.className = "arf-fold";
        head.setAttribute("aria-expanded", open ? "true" : "false");
        const caret = el("span", "arf-caret", open ? CARET_OPEN : CARET_SHUT);
        head.appendChild(caret);
        head.appendChild(el("span", "arf-grow", title));
        wrap.appendChild(head);
        // Built either way and hidden while it is shut, so opening one is the body
        // it already has being shown. Repainting the drawer for it would be a
        // teardown and a rebuild to show rows that are already worked out, which
        // is a flash on screen for nothing.
        const body = el("div", "arf-foldbody");
        fill(body);
        body.hidden = !open;
        wrap.appendChild(body);
        head.addEventListener("click", () => {
            const now = !openFolds.has(title);
            if (now)
                openFolds.add(title);
            else
                openFolds.delete(title);
            // A search holds every fold open, so a click during one records what you
            // wanted without closing anything in front of you.
            body.hidden = !(now || !!hunt.trim());
            if (!body.hidden)
                arrive(body);
            caret.textContent = now ? CARET_OPEN : CARET_SHUT;
            head.setAttribute("aria-expanded", now ? "true" : "false");
        });
        return wrap;
    }
    let hunt = "";
    function buildSearch() {
        const wrap = el("div", "arf-col");
        const row = el("div", "arf-row");
        const box = document.createElement("input");
        box.type = "search";
        box.className = "arf-field arf-grow";
        box.placeholder = "Search settings";
        box.value = hunt;
        box.setAttribute("aria-label", "Search settings");
        box.setAttribute("data-arf-field", "hunt");
        // Filters as you type. Held out of cfg because a search is about the next
        // ten seconds, not a setting to carry between sessions.
        box.addEventListener("input", () => {
            hunt = box.value;
            paint();
        });
        // No Clear button beside it. A search field already carries one, drawn by
        // the browser, and the rule above gives it a colour that follows the theme
        // instead of the white cross it came with. A second one is a button that
        // appears and disappears next to a control that never moved.
        row.appendChild(box);
        wrap.appendChild(row);
        const hits = el("div", "arf-note", searchSays());
        hits.setAttribute("data-arf-hits", "1");
        wrap.appendChild(hits);
        return wrap;
    }
    let lastHits = 0;
    function searchSays() {
        if (!hunt.trim())
            return "";
        return lastHits
            ? lastHits + (lastHits === 1 ? " card" : " cards") + " across every tab, grouped by where they live."
            : "";
    }
    // Whether a built card answers what was typed. Read off the card itself, so
    // a label, a hint and the text of a block are all searchable without a second
    // list of keywords to keep in step with the panel.
    // What a card actually says. Rows that hang off a switch are built whether or
    // not their switch is on, so textContent would let the search find a setting
    // that is not on the card to be found, and hand back a card that looks like
    // it does not hold what was searched for.
    function shownText(node) {
        if (!node)
            return "";
        if (node.nodeType === 3)
            return String(node.nodeValue || "");
        if (node.nodeType !== 1 || node.hidden)
            return "";
        let out = "";
        const kids = node.childNodes || [];
        for (let i = 0; i < kids.length; i++)
            out += shownText(kids[i]) + " ";
        return out;
    }
    function matches(c) {
        const want = hunt.trim().toLowerCase();
        if (!want)
            return true;
        try {
            return shownText(c).toLowerCase().indexOf(want) >= 0;
        }
        catch (_) {
            return false;
        }
    }
    // Every card on one tab. One list, used by the tab itself and by the search,
    // so the two cannot end up showing different things.
    function tabCards(id) {
        if (id === "prompt")
            return [buildBlocksCard(), buildMacroCard(), buildPresetCard()];
        if (id === "context")
            return [buildContextCard(), buildPreviewCard(), buildTryCard()];
        if (id === "model")
            return [buildConnectionCard(), buildSamplerCard(), buildSetupCard()];
        if (id === "limits")
            return [buildProtectCard(), buildReadCard(), buildGuardCard(), buildSafetyCard()];
        if (id === "log") {
            return [buildLiveCard(), buildNotesCard(), buildActivityCard(), buildDebugCard()];
        }
        return [
            buildPermsCard(),
            buildChatCard(),
            buildAlertCard(),
            buildReachCard(),
            buildTransferCard(),
        ];
    }
    function buildTabs() {
        const strip = el("div", "arf-tabs");
        strip.setAttribute("role", "tablist");
        const here = tabNow();
        for (const t of TABS) {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "arf-tab";
            b.textContent = t.label;
            b.setAttribute("role", "tab");
            b.setAttribute("aria-selected", t.id === here ? "true" : "false");
            b.addEventListener("click", () => {
                cfg.tab = t.id;
                persist(true);
                paint();
            });
            strip.appendChild(b);
        }
        return strip;
    }
    // Whatever is actually doing the scrolling. The drawer gives the tab a root
    // to fill, and depending on the build the scrollbar is on that root, on
    // something above it, or on the page.
    // Every ancestor that can scroll, plus the window. One was not enough: the
    // drawer nests, and which of the boxes actually holds the scrollbar depends
    // on the build and on how tall the panel happens to be. Reading them all and
    // putting them all back costs nothing and cannot pick the wrong one.
    function scrollers(root) {
        const out = [];
        try {
            let node = root;
            let hops = 0;
            while (node && hops < 12) {
                hops++;
                if (node.scrollTop > 0)
                    out.push({ node: node, at: node.scrollTop });
                node = node.parentElement;
            }
            const w = globalThis;
            const page = document.scrollingElement || document.documentElement;
            if (page && page.scrollTop > 0)
                out.push({ node: page, at: page.scrollTop });
            if (w && w.scrollY > 0)
                out.push({ node: w, at: w.scrollY });
        }
        catch (_) { }
        return out;
    }
    // In the order they are worth holding on to. What you touched beats what
    // happens to be on screen, and a named card outlives the blocks inside it.
    const ANCHOR_MARKS = ["data-arf-field", "data-arf-btn", "data-arf-block", "data-arf-row", "data-arf-card"];
    function anchorSel(n) {
        for (const name of ANCHOR_MARKS) {
            const v = n && n.getAttribute && n.getAttribute(name);
            // A value carrying a quote or a backslash would need escaping to go in a
            // selector, and none of them do. Skipped rather than escaped.
            if (v != null && !/["\\]/.test(v))
                return "[" + name + '="' + v + '"]';
        }
        return null;
    }
    function anchorNow(root) {
        try {
            let node = null;
            const on = document.activeElement;
            // The button you just pressed, or the box you are typing in, or the
            // nearest thing above it with a name.
            if (on && root.contains && root.contains(on)) {
                node = on;
                while (node && node !== root && !anchorSel(node))
                    node = node.parentElement;
                if (node === root)
                    node = null;
            }
            if (!node) {
                // Nothing touched, so the topmost card still on screen. A card and not
                // whatever element happens to be highest: a block is given a new id by
                // every preset load, so anchoring to one means anchoring to something
                // that will not be there to find.
                const marks = root.querySelectorAll("[data-arf-card]");
                for (let i = 0; i < marks.length; i++) {
                    const m = marks[i];
                    if (m.hidden)
                        continue;
                    const box = m.getBoundingClientRect();
                    if (!box.height || box.bottom <= 0)
                        continue;
                    node = m;
                    break;
                }
            }
            const sel = node && anchorSel(node);
            if (!sel)
                return null;
            // Which one, since Delete is on every block and Load is on more than one
            // card.
            const all = root.querySelectorAll(sel);
            let nth = 0;
            for (let i = 0; i < all.length; i++)
                if (all[i] === node) {
                    nth = i;
                    break;
                }
            return { sel: sel, nth: nth, at: node.getBoundingClientRect().top };
        }
        catch (_) {
            return null;
        }
    }
    // Moves whichever box is doing the scrolling until the anchor is back where
    // it was. Which box that is depends on the build, so this tries them and
    // keeps the one that helped, and writes the result back into held so the
    // later attempts at putting the scroll back do not undo it.
    function reAnchor(root, a, held) {
        if (!a)
            return;
        try {
            const all = root.querySelectorAll(a.sel);
            // The same one or nothing. Settling for a different match is worse than
            // not correcting at all: the blocks are given new ids by a preset load,
            // and the next Delete along is somewhere else entirely.
            const n = all[a.nth];
            if (!n)
                return;
            const w = globalThis;
            for (const one of held) {
                const drift = n.getBoundingClientRect().top - a.at;
                if (Math.abs(drift) < 1)
                    return;
                const was = one.node === w ? w.scrollY : one.node.scrollTop;
                const want = Math.max(0, was + drift);
                if (one.node === w && one.node.scrollTo)
                    one.node.scrollTo(0, want);
                else
                    one.node.scrollTop = want;
                const now = one.node === w ? w.scrollY : one.node.scrollTop;
                if (Math.abs(n.getBoundingClientRect().top - a.at) >= Math.abs(drift)) {
                    // Moving this one did not bring the anchor closer, so it is not the
                    // box the panel is scrolling in.
                    if (one.node === w && one.node.scrollTo)
                        one.node.scrollTo(0, was);
                    else
                        one.node.scrollTop = was;
                }
                else
                    one.at = now;
            }
        }
        catch (_) { }
    }
    // onlyShort is for the second and third attempts, a frame or two after the
    // rebuild. By then the only thing worth correcting is a scroll that came up
    // short because the panel was still growing when the first attempt ran.
    // Anything else at that point is the reader moving the page themselves, and
    // pulling them back is the jump this was written to stop.
    function putBack(held, onlyShort) {
        const w = globalThis;
        for (const one of held) {
            try {
                const node = one.node;
                if (!node)
                    continue;
                const now = node === w ? w.scrollY : node.scrollTop;
                if (now === one.at)
                    continue;
                if (onlyShort && !(now < one.at))
                    continue;
                if (node === w && node.scrollTo)
                    node.scrollTo(0, one.at);
                else
                    node.scrollTop = one.at;
            }
            catch (_) { }
        }
    }
    // A switch is the one control here that has to look like it moved. The knob
    // slides because CSS is watching the box change, and a box taken out of the
    // page loses whatever it was animating, so a rebuild landing on the same
    // gesture turns the slide into a jump.
    //
    // So a switch does two things instead of one. The rows hanging off it are
    // shown and hidden where they stand, which is instant and moves nothing else,
    // and the rebuild that catches everything else up - the count on the card,
    // the warning that appears when the last check goes off, the greyed-out
    // button - waits until the knob has arrived. Flicking three switches in a row
    // is one rebuild rather than three.
    let settleTimer = null;
    function settle() {
        if (settleTimer)
            clearTimeout(settleTimer);
        settleTimer = setTimeout(() => {
            settleTimer = null;
            paint();
        }, SETTLE_MS);
    }
    disposers.push(() => {
        if (settleTimer)
            clearTimeout(settleTimer);
        settleTimer = null;
    });
    // Every row that hangs off a switch, shown or hidden where it stands. The row
    // carries the field it was built from, so this cannot go looking for a list
    // of which switches have children and be wrong about it, which is the mistake
    // that kept being made when it did.
    function reveal() {
        if (!tab || !tab.root)
            return;
        try {
            const rows = tab.root.querySelectorAll("[data-arf-row]");
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const f = row._arfField;
                if (!f)
                    continue;
                const away = !fieldShows(f);
                if (row.hidden === away)
                    continue;
                row.hidden = away;
                if (!away)
                    arrive(row);
            }
        }
        catch (_) { }
    }
    // A row that has just been switched on, fading down into place. Reading the
    // layout between taking the class off and putting it back is what makes the
    // browser treat it as a new animation rather than one already finished.
    function arrive(row) {
        try {
            row.classList.remove("arf-arrive");
            void row.offsetWidth;
            row.classList.add("arf-arrive");
        }
        catch (_) { }
    }
    function paint() {
        // A rebuild from any other cause has already done what the settle was
        // waiting to do.
        if (settleTimer) {
            clearTimeout(settleTimer);
            settleTimer = null;
        }
        // The buttons on the messages show the same state this panel does, so they
        // are refreshed with it rather than on a timer of their own.
        // And the floating button. Painting it only from the live clock is not
        // enough: that clock runs while a refine runs, so walking out to the home
        // screen would leave the button looking ready to refine something that is
        // not on the page.
        paintFloat();
        if (!tab || !tab.root)
            return;
        const root = tab.root;
        // Where you were reading. The panel is rebuilt from nothing on every
        // repaint, which resets the scroll to the top, so saving a preset from the
        // bottom of a long tab threw you back to the switch. Held and put back.
        const held = scrollers(root);
        // And what you were reading, so a panel that comes back a different height
        // can be corrected by however far that moved rather than left where the
        // pixel count lands.
        const held2 = anchorNow(root);
        // The rule boxes are rebuilt with everything else, so a repaint while
        // somebody is typing would take the cursor with it. Held and put back.
        const focusKey = document.activeElement?.getAttribute?.("data-arf-field");
        const caret = document.activeElement?.selectionStart;
        root.innerHTML = "";
        root.className = "arf";
        liveEls = null;
        root.appendChild(buildHeader());
        // A refused permission that stops the whole thing is the answer to "why is
        // nothing happening", and it belongs where that question gets asked rather
        // than on a tab somebody has to go and find.
        for (const p of missing())
            if (p.fatal)
                root.appendChild(bad(p.label + " is refused, so nothing can be refined. " + p.without));
        // First, above everything. A refine waiting on an answer is the one thing on
        // this panel that is holding something up.
        if (pending)
            root.appendChild(buildPendingCard());
        const back = undoHere();
        if (back.length)
            root.appendChild(buildLastRefine(back));
        root.appendChild(buildSearch());
        // The strip is not a way around while a search is on: what is below is
        // everything that matched, from every tab, so a tab to stand on would be
        // the wrong idea of where you are.
        if (!hunt.trim())
            root.appendChild(buildTabs());
        const body = el("div", "arf-body");
        if (hunt.trim()) {
            // Searching looks everywhere. A setting you cannot remember the home of
            // is exactly the one you are searching for, so filtering only the tab you
            // happen to be standing on would answer the wrong question.
            let hits = 0;
            for (const t of TABS) {
                const found = tabCards(t.id).filter((c) => matches(c));
                if (!found.length)
                    continue;
                hits += found.length;
                body.appendChild(el("div", "arf-h", t.label));
                for (const c of found)
                    body.appendChild(c);
            }
            lastHits = hits;
            if (!hits)
                body.appendChild(note("Nothing matched. Try a shorter word."));
        }
        else {
            for (const c of tabCards(tabNow()))
                body.appendChild(c);
        }
        root.appendChild(body);
        setScheme(root);
        // Put back before the frame is painted, or the panel visibly jumps to the
        // top and back down.
        putBack(held);
        reAnchor(root, held2, held);
        // Colours only resolve once the tree is in the page and laid out, so the
        // repair runs a frame later rather than against a half-built panel. The
        // scroll is set again there and once more after: a panel that grew taller
        // between the frames would have clamped the earlier attempts to its old
        // height, which is what left this looking unfixed.
        try {
            requestAnimationFrame(() => {
                sweepReadable(root);
                putBack(held, true);
                reAnchor(root, held2, held);
                requestAnimationFrame(() => {
                    putBack(held, true);
                    reAnchor(root, held2, held);
                });
            });
        }
        catch (_) {
            sweepReadable(root);
            putBack(held);
            reAnchor(root, held2, held);
        }
        if (focusKey) {
            const back = root.querySelector('[data-arf-field="' + focusKey + '"]');
            if (back && typeof back.focus === "function") {
                // Without preventScroll the browser brings the box it just focused into
                // view, which on a panel that has changed height is a scroll nobody
                // asked for, landing after everything above has finished putting the
                // page back where it was.
                try {
                    back.focus({ preventScroll: true });
                }
                catch (_) {
                    back.focus();
                }
                try {
                    if (caret != null && back.setSelectionRange)
                        back.setSelectionRange(caret, caret);
                }
                catch (_) { }
            }
        }
    }
    // ---- the control card, which never moves ----
    // Above the tabs, because the switch and the button are what somebody came
    // for, and hunting for the master switch on the tab it happens to live on is
    // the thing that makes a tabbed panel worse than a list.
    function buildHeader() {
        headerHeldTurn = holdsTurn(blockList("blocks"));
        const wrap = card();
        // Findable, so it can be swapped on its own by something that has no reason
        // to rebuild the rest of the panel.
        wrap.setAttribute("data-arf-header", "1");
        const top = el("div", "arf-row");
        const mark = el("span", "arf-mark");
        mark.innerHTML = refineIcon();
        const name = el("div", "arf-cardh arf-grow", "Auto Refine");
        const sw = document.createElement("input");
        sw.type = "checkbox";
        sw.checked = !!cfg.enabled;
        sw.setAttribute("aria-label", "Turn Auto Refine on");
        sw.className = "arf-box";
        sw.addEventListener("change", () => {
            cfg.enabled = !!sw.checked;
            persist(true);
            reveal();
            settle();
        });
        top.appendChild(mark);
        top.appendChild(name);
        top.appendChild(sw);
        wrap.appendChild(top);
        // Built as the clock would write it, so a repaint in the middle of a refine
        // does not throw the line back to what it said before the refine started.
        const shown = liveNow();
        const line = el("div", "arf-row arf-note");
        const dot = el("span", shown.dot);
        const words = el("span", "", shown.text);
        line.appendChild(dot);
        line.appendChild(words);
        wrap.appendChild(line);
        // Held so the running clock can be written straight into it. Repainting the
        // whole panel once a second to move one number would close every open
        // select and lose the caret in whatever box was being typed in.
        liveEls = { dot: dot, text: words };
        const row = el("div", "arf-row");
        const stop = whyNot();
        // A run through the chat takes the place of the two buttons while it is
        // going, rather than being reported somewhere else: what it is doing and
        // the way to end it belong where the button that started it was.
        if (sweep) {
            wrap.appendChild(note("Going through the chat: reply " + sweep.at + " of " + sweep.of + ", " +
                sweep.saved + " refined, " + sweep.skipped + " left alone."));
            const halt = button("Stop", false);
            halt.setAttribute("data-arf-sweep-stop", "1");
            halt.title = "Ends the run after the reply it is on, so nothing is left half written.";
            halt.addEventListener("click", () => stopRefine());
            row.appendChild(halt);
            wrap.appendChild(row);
            return wrap;
        }
        // A refine that is running takes the place of the button that started it,
        // the same way a run through the chat does.
        //
        // Stopping belongs here as well as on the floating button, since that
        // button can be switched off and a panel that answers a running refine by
        // greying its buttons out says wait rather than saying there is a way out
        // of it.
        if (busy) {
            const halt = button("Stop this refine", true);
            halt.setAttribute("data-arf-stop", "1");
            halt.title = "Calls off the refine that is running. Nothing is saved and the reply is left as it is.";
            halt.addEventListener("click", () => cancelRefine());
            row.appendChild(halt);
            wrap.appendChild(row);
            return wrap;
        }
        const now = button("Refine the latest reply", true);
        now.disabled = !!stop;
        now.style.opacity = now.disabled ? "0.5" : "1";
        now.style.cursor = now.disabled ? "not-allowed" : "pointer";
        if (stop)
            now.title = stop;
        now.addEventListener("click", () => refineNow());
        row.appendChild(now);
        // The whole chat, next to the one reply, and the only place it appears. A
        // chat written before the extension was installed is the ordinary reason
        // somebody opens this panel at all, so the button belongs where they are
        // already looking.
        const every = button("Refine every reply here", false);
        every.setAttribute("data-arf-sweep", "1");
        every.disabled = !!stop || lastChatId == null;
        every.style.opacity = every.disabled ? "0.5" : "1";
        every.style.cursor = every.disabled ? "not-allowed" : "pointer";
        every.title =
            stop || "Goes through this chat oldest first, one model call per reply. It asks first.";
        every.addEventListener("click", () => askSweep());
        row.appendChild(every);
        // The third thing a refine can be pointed at, standing next to the other
        // two rather than living only in a menu over the chat or a row inside
        // Extras. Both of those are a hunt, and this is the one people reach for
        // while the panel is already open in front of them.
        if (cfg.inputRefine) {
            const draft = button("Refine what I am typing", false);
            const noDraft = whyNotDraft();
            draft.setAttribute("data-arf-draft", "1");
            draft.disabled = !!noDraft || !!inputWaiting;
            draft.style.opacity = draft.disabled ? "0.5" : "1";
            draft.style.cursor = draft.disabled ? "not-allowed" : "pointer";
            draft.title = inputWaiting
                ? "Already refining your draft."
                : noDraft ||
                    "Rewrites what is in the chat's input box, before you send it. Nothing is written to the chat.";
            draft.addEventListener("click", () => refineInput());
            row.appendChild(draft);
        }
        const auto = document.createElement("label");
        auto.className = "arf-row arf-note";
        auto.style.cursor = "pointer";
        const autoBox = document.createElement("input");
        autoBox.type = "checkbox";
        autoBox.checked = !!cfg.refineOn;
        autoBox.className = "arf-box";
        autoBox.addEventListener("change", () => {
            cfg.refineOn = !!autoBox.checked;
            persist(true);
            reveal();
            settle();
        });
        auto.appendChild(autoBox);
        auto.appendChild(el("span", "", "every reply, automatically"));
        row.appendChild(auto);
        wrap.appendChild(row);
        // Why the button is greyed out, said once rather than left to a tooltip
        // nobody sees on a phone. The master switch being off is not written out:
        // the switch is right there saying it.
        if (stop && cfg.enabled)
            wrap.appendChild(warn(stop));
        if (outsideAnyChat())
            wrap.appendChild(note("Refining runs inside a chat. On the home screen or a character page there is nothing to refine yet, so the panel waits here."));
        return wrap;
    }
    // Every refine in this chat that can still be put back, newest first. It used
    // to show one, which meant a second refine took away the way back from the
    // first without saying so.
    // A refine waiting on your yes. Held here so it exists whether or not the host
    // can draw a modal: without this, a Lumiverse with no showModal dropped the
    // whole refine on the floor and said nothing, which reads as the button not
    // working.
    let pending = null;
    function takePending(yes) {
        const one = pending;
        pending = null;
        if (!undoHere().length)
            setBadge(null);
        if (!one)
            return;
        if (yes) {
            send({
                type: "apply_refine",
                requestId: newId(),
                chatId: one.chatId,
                messageId: one.messageId,
                after: one.after,
            });
            log("accepted a refine", true);
        }
        else {
            log("turned a refine down");
            toast("Left as it was.", true);
        }
        paint();
    }
    function buildPendingCard() {
        const one = pending;
        const wrap = card("Waiting for you", "This refine is written and nothing has been saved. Read both and say which one stands.", new Date(one.at).toTimeString().slice(0, 5));
        wrap.appendChild(el("div", "arf-lab", "As it is now"));
        wrap.appendChild(el("div", "arf-well arf-scroll", one.before));
        wrap.appendChild(el("div", "arf-lab", "After the refine"));
        wrap.appendChild(el("div", "arf-well arf-scroll", one.after));
        const row = el("div", "arf-row");
        const yes = button("Accept it", true);
        yes.setAttribute("data-arf-pending", "accept");
        yes.addEventListener("click", () => takePending(true));
        const no = button("Turn it down", false);
        no.setAttribute("data-arf-pending", "decline");
        no.addEventListener("click", () => takePending(false));
        const big = button("Read it in full", false);
        big.addEventListener("click", () => openBig("Both versions", "As it is now\n\n" + one.before + "\n\n---\n\nAfter the refine\n\n" + one.after));
        row.appendChild(yes);
        row.appendChild(no);
        row.appendChild(big);
        wrap.appendChild(row);
        return wrap;
    }
    function buildLastRefine(list) {
        const wrap = card(list.length === 1 ? "The last refine" : "Refines you can put back", undefined, list.length > 1 ? String(list.length) : undefined);
        wrap.setAttribute("data-arf-last", "1");
        for (let i = 0; i < list.length; i++) {
            const one = list[i];
            // The newest is open; the rest are folded, or a busy chat buries the panel
            // under its own history.
            if (i === 0)
                wrap.appendChild(buildUndoRow(one));
            else
                wrap.appendChild(fold(new Date(one.at).toTimeString().slice(0, 5) + " refine", (body) => {
                    body.appendChild(buildUndoRow(one));
                }));
        }
        if (list.length > 1) {
            const all = el("div", "arf-row");
            const clear = button("Dismiss them all", false);
            clear.addEventListener("click", () => {
                for (const one of list)
                    undoable.delete(undoKey(one.chatId, one.messageId));
                if (!undoHere().length)
                    setBadge(null);
                paint();
            });
            all.appendChild(clear);
            wrap.appendChild(all);
        }
        return wrap;
    }
    // ---- what actually changed ----
    // Two paragraphs side by side leave the reader to find the difference
    // themselves, which on a rewrite of one sentence in six is most of the work.
    // This marks it: taken out is struck through, put in is not, and everything
    // the rewrite left alone is drawn as ordinary text, because that is nearly
    // all of it and colouring it would drown the part that matters.
    //
    // By word, not by character. A character diff on prose finds the letters two
    // different words happen to share and marks half of each, which reads as
    // noise; a line diff on a paragraph marks the whole paragraph. Whitespace
    // travels with the word before it so the text still reads as text once the
    // pieces are put back together.
    function words(t) {
        return String(t == null ? "" : t).match(/\s*\S+\s*|\s+/g) || [];
    }
    // The longest run of words the two have in common, which is what tells a
    // rewrite from a replacement. Bounded: the table is one row per word pair, so
    // a pair of very long messages would be a big table and a slow frame. Past
    // the cap it says so rather than freezing the panel, and the two texts are
    // shown whole instead.
    const DIFF_MAX = 1200;
    function diffWords(a, b) {
        const n = a.length;
        const m = b.length;
        // A table of common-run lengths, built from the end back.
        const len = [];
        for (let i = 0; i <= n; i++)
            len.push(new Array(m + 1).fill(0));
        for (let i = n - 1; i >= 0; i--)
            for (let j = m - 1; j >= 0; j--)
                len[i][j] =
                    a[i].trim() === b[j].trim() && a[i].trim()
                        ? len[i + 1][j + 1] + 1
                        : Math.max(len[i + 1][j], len[i][j + 1]);
        const out = [];
        const add = (how, text) => {
            const last = out[out.length - 1];
            // Runs, not words. One span per word would be hundreds of elements and
            // would break the line wherever a word boundary fell.
            if (last && last.how === how)
                last.text += text;
            else
                out.push({ how: how, text: text });
        };
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (a[i].trim() === b[j].trim() && a[i].trim()) {
                add(0, b[j]);
                i++;
                j++;
            }
            else if (len[i + 1][j] >= len[i][j + 1]) {
                add(-1, a[i]);
                i++;
            }
            else {
                add(1, b[j]);
                j++;
            }
        }
        while (i < n)
            add(-1, a[i++]);
        while (j < m)
            add(1, b[j++]);
        return out;
    }
    function diffWell(before, after) {
        const well = el("div", "arf-well arf-scroll");
        well.setAttribute("data-arf-diff", "1");
        const a = words(before);
        const b = words(after);
        if (a.length + b.length > DIFF_MAX) {
            // Too big to mark word by word without a visible pause. Both are shown
            // whole, which is what this replaced, rather than nothing.
            well.appendChild(el("div", "arf-note", "Too long to mark up. Before:"));
            well.appendChild(el("div", "arf-dim", before));
            well.appendChild(el("div", "arf-note", "After:"));
            well.appendChild(el("span", "", after));
            return well;
        }
        const parts = diffWords(a, b);
        // Nothing marked means the two are the same, which is worth saying rather
        // than showing an unmarked paragraph that looks like a failed diff.
        if (!parts.some((p) => p.how !== 0)) {
            well.appendChild(el("span", "", after));
            return well;
        }
        for (const p of parts)
            well.appendChild(el("span", p.how === -1 ? "arf-cut" : p.how === 1 ? "arf-add" : "", p.text));
        return well;
    }
    function buildUndoRow(one) {
        const box = el("div", "arf-col");
        box.appendChild(el("div", "arf-note", "What changed"));
        box.appendChild(diffWell(one.before, one.after));
        const row = el("div", "arf-row");
        const back = button("Put it back", false);
        back.addEventListener("click", () => {
            askUndo(one.chatId, one.messageId);
        });
        const seen = button("Dismiss", false);
        seen.addEventListener("click", () => {
            undoable.delete(undoKey(one.chatId, one.messageId));
            if (!undoHere().length)
                setBadge(null);
            paint();
        });
        row.appendChild(back);
        row.appendChild(seen);
        box.appendChild(row);
        return box;
    }
    // ---- the card that comes up on the page ----
    // A refine changes writing you were reading, and the panel is behind a tab.
    // Somebody who has not opened that tab had no way to see what changed and no
    // way back, other than a floating button that had quietly turned into an undo
    // button without saying so. This puts the before, the after and the way back
    // in front of them, on the page, where the change happened.
    let popEl = null;
    let popShade = null;
    // The element the working is written into while it is being written.
    let popKey = "";
    // Every undo goes through here, and every one is written down against its
    // request. Reading the message out of the answer alone is not enough, since
    // an answer that does not name one leaves the panel's delete skipped: the
    // reply comes back restored while the panel goes on offering to restore it.
    const undoAsked = new Map();
    function askUndo(chatId, messageId) {
        const id = newId();
        undoAsked.set(id, { chatId: chatId, messageId: messageId });
        // Bounded: an answer that never comes must not pile up for the session.
        while (undoAsked.size > 20)
            undoAsked.delete(undoAsked.keys().next().value);
        send({ type: "undo_refine", requestId: id, chatId: chatId, messageId: messageId });
    }
    function dropPop() {
        try {
            popEl && popEl.remove && popEl.remove();
        }
        catch (_) { }
        try {
            popShade && popShade.remove && popShade.remove();
        }
        catch (_) { }
        popEl = null;
        popShade = null;
        popKey = "";
    }
    disposers.push(dropPop);
    // The card is pinned to the bottom of the screen, so a card that gets shorter
    // moves its top edge down by the difference, all at once. Held at the height
    // it had and let down to the one it wants, so the edge travels instead.
    // Which run of this is the current one. Two refines close together resize the
    // same card twice, and the first run's fallback timer coming due in the middle
    // of the second would hand the card its own height back mid-travel, which is
    // the jump this exists to avoid.
    let settleTick = 0;
    function settleHeight(box, was) {
        try {
            if (!(was > 0) || !box || !box.style)
                return;
            const now = box.getBoundingClientRect().height;
            if (!(now > 0) || Math.abs(now - was) < 2)
                return;
            const mine = ++settleTick;
            box.style.height = was + "px";
            box.style.overflow = "hidden";
            // Read the layout between the two, or the browser sees one value being
            // set and nothing to travel between.
            void box.offsetWidth;
            box.style.transition = "height var(--lumiverse-transition-fast,180ms) ease-out";
            box.style.height = now + "px";
            const done = (e) => {
                if (e && e.target !== box)
                    return;
                if (mine !== settleTick)
                    return;
                box.style.height = "";
                box.style.overflow = "";
                box.style.transition = "";
                try {
                    box.removeEventListener("transitionend", done);
                }
                catch (_) { }
            };
            box.addEventListener("transitionend", done);
            // A transition that never runs, on a page that will not animate, must
            // still give the card its own height back.
            setTimeout(() => done(), 500);
        }
        catch (_) { }
    }
    function showPop(one) {
        showCard({
            key: undoKey(one.chatId, one.messageId),
            title: "Refined",
            before: one.before,
            after: one.after,
            back: () => askUndo(one.chatId, one.messageId),
        });
    }
    // The same card for the draft in the input box. It is the same event from the
    // reader's side, a piece of their writing replaced by a rewrite, so it is the
    // same card: what changed, marked, with a way back on it. Putting this one
    // back is writing the old text into the box rather than asking the backend,
    // since the draft was never saved anywhere for the backend to hold.
    function showDraftPop(before, after) {
        showCard({
            key: "draft:" + Date.now(),
            title: "Your draft, refined",
            before: before,
            after: after,
            // The same way back the widget uses, so putting it back from the card
            // also takes the arrow off the button. Two of these drifted apart is how
            // a button ends up offering to undo something already undone.
            back: putDraftBack,
        });
    }
    function showCard(spec) {
        if (!cfg.popup)
            return;
        try {
            if (typeof document === "undefined" || !document.body)
                return;
            const key = spec.key;
            // The same refine twice is one card. A repaint or a second message about
            // a refine already on screen must not stack another one on top of it.
            // The working card is not the same refine and is always replaced.
            if (popEl && popKey === key)
                return;
            // Whatever card is up is this card, filled in rather than taken down and
            // put back up. The automatic pass lands one refine after another, and
            // swapping two elements for that means the old one vanishing and a new
            // one fading up from nothing at a different height, which reads as a
            // second card rather than as one card changing.
            //
            // Both cards are pinned to the bottom of the screen and they are not the
            // same height: the working one runs to about 370 pixels and this one to
            // about 220. Swapping the elements made the tall one vanish and a shorter
            // one fade up from nothing a hundred and fifty pixels lower, with the dim
            // behind them restarting its own fade, which reads as a second card
            // coming out from under the first. Keeping the box and the dim makes it
            // one card whose contents changed.
            const held = popEl;
            if (!held)
                dropPop();
            popKey = key;
            if (!held) {
                const shade = document.createElement("div");
                shade.className = "arf-shade";
                shade.setAttribute("data-arf-shade", "1");
                // A tap on the dim is the same as closing it, the way every sheet
                // works.
                shade.addEventListener("click", dropPop);
                document.body.appendChild(shade);
                popShade = shade;
            }
            const box = held || document.createElement("div");
            const wasTall = held ? held.getBoundingClientRect().height : 0;
            if (held)
                box.innerHTML = "";
            box.className = "arf-pop arf";
            box.setAttribute("data-arf-pop", "1");
            box.setAttribute("role", "status");
            const top = el("div", "arf-between");
            top.appendChild(el("span", "arf-h", spec.title));
            const shut = document.createElement("button");
            shut.type = "button";
            shut.className = "arf-x";
            shut.setAttribute("aria-label", "Close");
            shut.textContent = "×";
            shut.addEventListener("click", dropPop);
            top.appendChild(shut);
            box.appendChild(top);
            const body = el("div", "arf-pop-body");
            // Filling a card that was already standing there is a change of contents
            // rather than an arrival, so the contents are what fades.
            if (held)
                body.className += " arf-arrive";
            body.appendChild(el("div", "arf-note", "What changed"));
            body.appendChild(diffWell(spec.before, spec.after));
            // This card lands on top of the one that was showing the model's working,
            // which is a second of reading for something worth more than that. Said
            // rather than left to be missed twice.
            if (keptNotes)
                body.appendChild(el("div", "arf-note", "Its working is on the Log tab, under What the model worked out."));
            box.appendChild(body);
            const row = el("div", "arf-row arf-pop-row");
            const back = button("Put it back", false);
            back.setAttribute("data-arf-pop-undo", "1");
            back.addEventListener("click", () => {
                spec.back();
                dropPop();
            });
            const keep = button("Keep it", true);
            keep.setAttribute("data-arf-pop-keep", "1");
            keep.addEventListener("click", () => {
                // Keeping is not the same as forgetting: the refine stays in the Log,
                // where it can still be put back later. This only closes the card.
                dropPop();
            });
            row.appendChild(keep);
            row.appendChild(back);
            box.appendChild(row);
            if (!held)
                document.body.appendChild(box);
            else
                settleHeight(box, wasTall);
            popEl = box;
            // Painted a frame later, once it is in the page and has a colour behind
            // it to measure against, the same as the panel.
            try {
                requestAnimationFrame(() => {
                    setScheme(box);
                    sweepReadable(box);
                });
            }
            catch (_) { }
        }
        catch (_) {
            // A host that will not take an element is not a reason to lose the
            // refine: it is still in the Log, and the tab's badge still counts it.
            popEl = null;
            popKey = "";
        }
    }
    // ---- Prompt ----
    function buildTryCard() {
        const wrap = card("Try it", "Runs one refine on whatever is in the box and shows what comes back. Nothing is written to your chat.");
        const ta = document.createElement("textarea");
        ta.rows = 3;
        ta.placeholder = "Paste a reply here";
        ta.setAttribute("data-arf-field", "tryText");
        ta.setAttribute("aria-label", "Text to try the rules on");
        ta.className = "arf-field";
        wrap.appendChild(ta);
        const row = el("div", "arf-row");
        const grab = button("Use my last reply", false);
        grab.addEventListener("click", () => {
            const t = lastRenderedReply();
            if (!t) {
                tryResult = { ok: false, text: "Could not find a reply on screen to read." };
                paint();
                return;
            }
            ta.value = t;
            ta.focus();
        });
        const go = button("Try it", false);
        go.disabled = tryBusy;
        go.style.opacity = tryBusy ? "0.5" : "1";
        go.addEventListener("click", () => {
            const text = String(ta.value || "").trim();
            if (!text) {
                tryResult = { ok: false, text: "Put some text in the box first." };
                paint();
                return;
            }
            if (noTurn()) {
                tryResult = {
                    ok: false,
                    text: "No block in your prompt has {{message}} in it, so there is nothing to rewrite.",
                };
                paint();
                return;
            }
            // For the same reason as the draft above: this ends in the same message,
            // and that message clears the running state.
            if (busy) {
                tryResult = { ok: false, text: "A refine is already running. Wait for it, or stop it first." };
                paint();
                return;
            }
            tryBusy = true;
            tryResult = null;
            persist(true);
            const id = newId();
            tryWaiting = id;
            send({ type: "try_refine", requestId: id, text: text, asUser: false });
            paint();
        });
        // No model behind this one. It is the half of the standard a plain scan can
        // judge, and it answers "is this reply worth a call" for nothing.
        const look = button("Scan it, free", false);
        look.addEventListener("click", () => {
            const text = String(ta.value || "").trim();
            if (!text) {
                scanSaid = "Put some text in the box first.";
                paint();
                return;
            }
            persist(true);
            const id = newId();
            scanWaiting = id;
            scanSaid = "Looking...";
            send({ type: "scan_text", requestId: id, text: text });
            paint();
        });
        row.appendChild(grab);
        row.appendChild(go);
        row.appendChild(look);
        wrap.appendChild(row);
        if (scanSaid)
            wrap.appendChild(note(scanSaid));
        if (tryBusy)
            wrap.appendChild(note("Working..."));
        else if (tryResult)
            wrap.appendChild(el("div", "arf-well arf-scroll" + (tryResult.ok ? "" : " arf-dim"), tryResult.text));
        return wrap;
    }
    let tryWaiting = null;
    // The free scan: what it found, and which ask it belongs to.
    let scanWaiting = null;
    let scanSaid = null;
    // No switch carries a list of what hangs off it. Every row is built whether
    // or not its switch is on, hidden when it is off, and a switch re-reads all
    // of them; the rebuild that catches up the rest of the card is behind
    // settle() above.
    //
    // A list is the thing to avoid here. Kept by hand it goes stale, and derived
    // from the field arrays it misses every row written inline in a card, which
    // leaves a row sitting under a switch that is off, offering a setting that
    // cannot do anything until you leave the tab and come back.
    // Whether a row has anything to do where it sits.
    function fieldShows(f) {
        if (!f.needs)
            return true;
        const held = cfg[f.needs.key];
        return f.needs.is === undefined ? !!held : held === f.needs.is;
    }
    function fieldRow(f) {
        // A row that says what it hangs off does not get drawn when that thing is
        // off, whoever asked for it. The lists filtered on the way in and the rows
        // written straight into a card did not, so Show me the words as they arrive
        // sat under Watch the rewrite arrive with the switch above it off, offering
        // a setting that could not do anything. Deciding it here means a row cannot
        // be added without its condition being read.
        //
        // Built either way and hidden when it has nothing to do, rather than left
        // out. A card is still one row per field to anything counting, the gap
        // between rows is not drawn around nothing, and the row is already standing
        // there when its switch goes on, so it appears without the panel being
        // rebuilt underneath the finger that switched it.
        const wrap = el("div", "arf-col" + (f.under ? " arf-under" : ""));
        wrap.setAttribute("data-arf-row", f.key);
        wrap._arfField = f;
        wrap.hidden = !fieldShows(f);
        if (f.type === "bool") {
            const lab = document.createElement("label");
            lab.className = "arf-between";
            lab.style.cursor = "pointer";
            lab.appendChild(el("span", "arf-lab", f.label));
            const box = document.createElement("input");
            box.type = "checkbox";
            box.checked = !!cfg[f.key];
            box.setAttribute("data-arf-field", f.key);
            box.className = "arf-box";
            box.addEventListener("change", () => {
                cfg[f.key] = !!box.checked;
                persist(true);
                reveal();
                settle();
            });
            lab.appendChild(box);
            wrap.appendChild(lab);
        }
        else if (f.type === "lines") {
            wrap.appendChild(el("div", "arf-lab", f.label));
            const ta = document.createElement("textarea");
            ta.setAttribute("data-arf-field", f.key);
            ta.setAttribute("aria-label", f.label);
            ta.className = "arf-field arf-mono";
            ta.rows = 3;
            ta.value = String(cfg[f.key] == null ? "" : cfg[f.key]);
            ta.addEventListener("input", () => {
                cfg[f.key] = ta.value;
                persist();
            });
            ta.addEventListener("blur", () => {
                cfg[f.key] = ta.value;
                persist(true);
            });
            wrap.appendChild(ta);
        }
        else if (f.type === "pick") {
            wrap.appendChild(el("div", "arf-lab", f.label));
            const sel = document.createElement("select");
            sel.setAttribute("data-arf-field", f.key);
            sel.setAttribute("aria-label", f.label);
            sel.className = "arf-field";
            const opts = f.key === "connectionId"
                ? [{ value: "", label: "The model I am chatting with" }]
                    .concat(connections.map((c) => ({
                    value: c.id,
                    label: (c.name || c.provider || "Connection") +
                        (c.model ? " (" + c.model + ")" : "") +
                        (c.isDefault ? " - default" : ""),
                })))
                    // A connection the settings name that the account does not have.
                    // Kept in the list and said out loud, because a select given a
                    // value none of its options carry shows nothing chosen at all:
                    // the box read as though the default were picked while the
                    // backend went on being handed the missing id, so every refine
                    // went somewhere that was not there and the panel looked right.
                    .concat(lostConnection() ? [{ value: String(cfg.connectionId), label: "A connection that is gone" }] : [])
                : f.options || [];
            for (const o of opts) {
                const op = document.createElement("option");
                op.value = o.value;
                op.textContent = o.label;
                sel.appendChild(op);
            }
            sel.value = String(cfg[f.key] == null ? "" : cfg[f.key]);
            sel.addEventListener("change", () => {
                cfg[f.key] = sel.value;
                persist(true);
                reveal();
                settle();
            });
            wrap.appendChild(sel);
        }
        else {
            wrap.appendChild(el("div", "arf-lab", f.label));
            const num = document.createElement("input");
            num.type = "number";
            if (f.min != null)
                num.min = String(f.min);
            if (f.max != null)
                num.max = String(f.max);
            num.value = String(cfg[f.key]);
            num.setAttribute("data-arf-field", f.key);
            num.setAttribute("aria-label", f.label);
            num.className = "arf-field";
            num.addEventListener("change", () => {
                let v = Math.round(Number(num.value));
                if (!Number.isFinite(v))
                    v = Number(CONFIG[f.key]);
                if (f.min != null)
                    v = Math.max(f.min, v);
                if (f.max != null)
                    v = Math.min(f.max, v);
                cfg[f.key] = v;
                num.value = String(v);
                persist(true);
            });
            wrap.appendChild(num);
        }
        if (f.hint)
            wrap.appendChild(note(f.hint));
        return wrap;
    }
    // ---- Prompt ----
    // The stored list when there is one, the default otherwise, with the two
    // locked blocks put back if a hand-edited or imported file has lost them.
    // Everything that draws or edits the layout goes through here, so a bad
    // stored value cannot take the section down with it.
    // Nothing is forced back into the list any more. A block list is the reader's
    // prompt, and putting a block back into somebody's prompt because this file
    // thinks it belongs there is the wrong kind of help. What a missing piece
    // costs is said out loud instead: no {{message}} anywhere is a warning on the
    // card and a refusal to refine.
    // Which of the two prompts the editor is showing. Held for the session
    // rather than saved: it is where you are looking, not a setting.
    let editing = "blocks";
    const editingYours = () => editing === "userBlocks";
    function blockList(which) {
        const key = which || editing;
        const raw = Array.isArray(cfg[key]) ? cfg[key] : [];
        const list = raw
            .filter((b) => b && typeof b === "object" && b.id)
            .slice(0, 60)
            .map((b) => ({
            id: String(b.id),
            on: b.on !== false,
            role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
            text: b.text == null ? "" : String(b.text),
            name: b.name == null ? "" : String(b.name),
        }));
        if (!list.length)
            return (key === "userBlocks" ? YOURS_DEFAULT : DEFAULT_BLOCKS).map((b) => ({ ...b }));
        return list;
    }
    function setBlocks(list, repaint) {
        cfg[editing] = list;
        persist(true);
        if (repaint !== false)
            paint();
    }
    const blockLabel = (b) => String(b.name || "").trim() || "Untitled block";
    // Which saved prompt this one is, if it is one of them. The four that ship
    // with the extension are looked at first, so the one it starts on is named as
    // itself rather than as whatever you later saved on top of it.
    function promptNamed(now, which) {
        // The four carry a reply prompt and nothing else, so there is nothing of
        // theirs to match your own messages against. Their shapes are worked out
        // once, at the top of this file, rather than on every repaint.
        if (which === "blocks")
            for (const p of BUILT_IN_SHAPES)
                if (p.shape === now)
                    return p.name;
        for (const p of presets) {
            const got = p.settings[which];
            if (!Array.isArray(got))
                continue;
            if (promptShape(got) === now)
                return p.name;
        }
        return null;
    }
    // What is loaded, said where the prompt is rather than left to be worked out.
    // The picker on the card below says what you last chose there, which is a
    // different thing: loading a preset and then changing one line leaves the
    // picker naming a prompt this no longer is. Read off the blocks themselves,
    // so it cannot drift from them.
    function whatThisIs() {
        const yours = editingYours();
        const now = promptShape(blockList());
        const named = promptNamed(now, yours ? "userBlocks" : "blocks");
        if (named)
            return named === DEFAULT_PROMPT_NAME && !yours
                ? "This is " + named + ", the one it starts on."
                : "This is " + named + ".";
        if (now === promptShape(yours ? YOURS_DEFAULT : DEFAULT_BLOCKS))
            return yours
                ? "This is the one it starts on."
                : "This is " + DEFAULT_PROMPT_NAME + ", the one it starts on.";
        return ("This is your own, and nothing saved matches it. Back to the default puts " +
            (yours ? "the one it starts on" : DEFAULT_PROMPT_NAME) +
            " back.");
    }
    // Whether this prompt asks the model to write down what it is doing. Only the
    // two for a model that thinks do, so on any of the others the card that shows
    // the working while it writes has nothing to show, and somebody waiting for
    // it has no way of knowing why. Said here, where the prompt is.
    const asksForWorking = () => blockList().some((b) => b.on && NOTES_TAG.test(String(b.text || "")));
    function aboutWorking() {
        if (asksForWorking())
            return cfg.popup
                ? "It asks the model for its working, which comes up on screen while it writes."
                : "It asks the model for its working, but Show the before and after on screen is off under When a refine lands, and that card is where the working appears.";
        return "It does not ask the model for its working, so there is nothing to watch while it writes. The two for a model that thinks do.";
    }
    // A block switched on or off, taken in where it stands.
    //
    // Rebuilding the tab for this meant tearing down every box of prompt on it
    // and building them again, which is the flicker: the boxes hold thousands of
    // characters and they are the tallest thing on the panel. Switching a block
    // changes four things and nothing else, so those four are done by hand.
    //
    //   how the block is drawn      the switch does that itself
    //   how many are on             the count on the card
    //   whether the message is sent the warning under it, and with it whether a
    //                               refine can happen at all, which is the header
    //                               and the floating button
    //   which prompt this now is    the line naming it, since a block switched
    //                               off is a prompt no preset matches
    // What the header was last built believing. Compared rather than assumed, so
    // the header is left alone unless a block switch has actually changed it.
    let headerHeldTurn = true;
    function refreshBlocks() {
        if (!tab || !tab.root)
            return;
        try {
            const root = tab.root;
            const list = blockList();
            const on = list.filter((b) => b.on).length;
            const pill = root.querySelector("[data-arf-blockcount]");
            if (pill)
                pill.textContent = on + " of " + list.length + " on";
            const said = root.querySelector("[data-arf-noturn]");
            if (said)
                said.hidden = holdsTurn(list);
            const line = root.querySelector("[data-arf-whatthisis]");
            if (line)
                line.textContent = whatThisIs() + " " + aboutWorking();
            // Only when the header would say something different. Switching a block
            // can change one thing up there, whether a refine can happen at all, and
            // swapping the header for every toggle takes the master switch down
            // mid-slide and restarts the live dot's pulse.
            const turn = holdsTurn(list);
            if (turn !== headerHeldTurn) {
                headerHeldTurn = turn;
                swapHeader();
            }
            paintFloat();
        }
        catch (_) { }
    }
    // The header on its own. It says whether a refine can happen and why not,
    // which a block switched off can change, and it is the one part of the panel
    // holding nothing anybody is part-way through typing into.
    function swapHeader() {
        if (!tab || !tab.root)
            return;
        try {
            const root = tab.root;
            const was = root.querySelector("[data-arf-header]");
            if (!was || !was.parentNode)
                return;
            was.parentNode.replaceChild(buildHeader(), was);
        }
        catch (_) { }
    }
    function buildBlocksCard() {
        const list = blockList();
        const on = list.filter((b) => b.on).length;
        const wrap = card("Your prompt", "The refine is one request, and this is it. Blocks are sent top to bottom, and two next to each other with the same role are joined into one message. A block that comes out empty is left out.", on + " of " + list.length + " on");
        // Marked so switching a block off can bring it up to date where it stands.
        const pillEl = wrap.querySelector(".arf-cardh .arf-pill");
        if (pillEl)
            pillEl.setAttribute("data-arf-blockcount", "1");
        // Two prompts, because refining a reply and tidying your own message are
        // different jobs. One prompt hedged to do both does neither well.
        const pick = el("div", "arf-seg");
        for (const one of [
            { id: "blocks", label: "For replies" },
            { id: "userBlocks", label: "For your messages" },
        ]) {
            const b2 = document.createElement("button");
            b2.type = "button";
            b2.className = "arf-segbtn";
            b2.textContent = one.label;
            b2.setAttribute("aria-pressed", editing === one.id ? "true" : "false");
            b2.setAttribute("data-arf-editing", one.id);
            b2.addEventListener("click", () => {
                editing = one.id;
                paint();
            });
            pick.appendChild(b2);
        }
        wrap.appendChild(pick);
        wrap.appendChild(note(editingYours()
            ? "Used when you refine one of your own messages, or the draft in your input box. Your own messages are never refined automatically, whatever else is switched on: it takes you asking."
            : "Used for every reply the character writes, by the automatic pass and by the refine button."));
        const isLine = note(whatThisIs() + " " + aboutWorking());
        isLine.setAttribute("data-arf-whatthisis", "1");
        wrap.appendChild(isLine);
        // Built either way and hidden while the prompt is fine, so switching the
        // block that carries the message off can show it without the card being
        // rebuilt around it.
        {
            const noTurnSaid = bad("No block has " +
                TURN_MACRO +
                " in it, so the model would never see the message it is meant to rewrite. Nothing here will be refined until one does.");
            noTurnSaid.setAttribute("data-arf-noturn", "1");
            noTurnSaid.hidden = holdsTurn(list);
            wrap.appendChild(noTurnSaid);
        }
        for (let i = 0; i < list.length; i++)
            wrap.appendChild(buildBlockRow(list, i));
        const acts = el("div", "arf-row");
        const add = button("Add a block", false);
        add.addEventListener("click", () => {
            const next = blockList();
            const made = {
                id: "own-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
                name: "New block",
                on: true,
                role: "system",
                // Empty. The prompts that ship with it use XML tags because that is
                // what works, but a tag is a style and not everybody writes that way.
                // A new block is a blank page.
                text: "",
            };
            // Above the turn rather than at the end. Anything after the message reads
            // as an instruction about it, which is rarely what a new rule is for.
            const turnAt = next.findIndex((b) => String(b.text || "").indexOf(TURN_MACRO) >= 0);
            next.splice(turnAt < 0 ? next.length : turnAt, 0, made);
            setBlocks(next);
        });
        const reset = button("Back to the default", false);
        reset.className += " arf-danger";
        reset.addEventListener("click", () => {
            setBlocks((editingYours() ? YOURS_DEFAULT : DEFAULT_BLOCKS).map((b) => ({ ...b })));
            log("put the prompt back to the default", true);
        });
        acts.appendChild(add);
        acts.appendChild(reset);
        wrap.appendChild(acts);
        return wrap;
    }
    function buildBlockRow(list, i) {
        const b = list[i];
        const holdsTurn = String(b.text || "").indexOf(TURN_MACRO) >= 0;
        const wrap = el("div", "arf-block" + (b.on ? "" : " arf-hushed"));
        wrap.setAttribute("data-arf-block", b.id);
        const top = el("div", "arf-between");
        const left = el("div", "arf-row arf-grow");
        const box = document.createElement("input");
        box.type = "checkbox";
        box.className = "arf-box";
        box.checked = b.on;
        box.setAttribute("aria-label", "Send " + blockLabel(b));
        box.addEventListener("change", () => {
            const next = blockList();
            next[i].on = !!box.checked;
            // Saved without a rebuild. This tab holds the whole prompt, several
            // boxes of it, and tearing all of that down to grey one block out was
            // the heaviest thing any switch on the panel did, and the flicker that
            // came with it. The greying is done here and the rest by refreshBlocks,
            // which brings the card's count, its warning, the line naming the prompt
            // and the header up to date without touching a single box of prompt.
            setBlocks(next, false);
            wrap.className = "arf-block" + (box.checked ? "" : " arf-hushed");
            refreshBlocks();
        });
        left.appendChild(box);
        const nameIn = document.createElement("input");
        nameIn.type = "text";
        nameIn.className = "arf-field arf-grow";
        nameIn.value = b.name || "";
        nameIn.placeholder = "What to call it";
        nameIn.setAttribute("aria-label", "Name for this block");
        nameIn.setAttribute("data-arf-field", "blockname:" + b.id);
        nameIn.addEventListener("change", () => {
            const next = blockList();
            next[i].name = nameIn.value;
            setBlocks(next, false);
        });
        left.appendChild(nameIn);
        top.appendChild(left);
        const moves = el("div", "arf-row");
        const move = (to, label, sign) => {
            const btn = button(sign, false);
            btn.className += " arf-mini";
            btn.setAttribute("aria-label", label + " " + blockLabel(b));
            btn.disabled = to < 0 || to >= list.length;
            btn.style.opacity = btn.disabled ? "0.45" : "1";
            btn.addEventListener("click", () => {
                const next = blockList();
                const held = next[i];
                next.splice(i, 1);
                next.splice(to, 0, held);
                setBlocks(next);
            });
            return btn;
        };
        moves.appendChild(move(i - 1, "Move up", "\u2191"));
        moves.appendChild(move(i + 1, "Move down", "\u2193"));
        top.appendChild(moves);
        wrap.appendChild(top);
        const ta = document.createElement("textarea");
        ta.rows = Math.min(12, Math.max(3, String(b.text || "").split("\n").length + 1));
        ta.className = "arf-field arf-mono";
        ta.value = b.text || "";
        ta.placeholder = "What you want it to do.";
        ta.setAttribute("aria-label", "Text for " + blockLabel(b));
        ta.setAttribute("data-arf-field", "blocktext:" + b.id);
        ta.addEventListener("input", () => {
            const next = blockList();
            next[i].text = ta.value;
            cfg.blocks = next;
            persist();
        });
        ta.addEventListener("blur", () => {
            const next = blockList();
            next[i].text = ta.value;
            // Rebuilt on the way out, not compared against the state before the edit:
            // the input handler above has already written the new text into cfg, so
            // by the time this runs there is nothing left to compare against. One
            // edit can take {{message}} out of the whole prompt, which changes the
            // warning on this card and greys out the refine button, and both have to
            // be right the moment you leave the box.
            setBlocks(next);
        });
        wrap.appendChild(ta);
        const foot = el("div", "arf-row");
        foot.appendChild(el("span", "arf-note", "Sent as"));
        const sel = document.createElement("select");
        sel.className = "arf-field";
        sel.style.maxWidth = "140px";
        sel.setAttribute("aria-label", "Role for " + blockLabel(b));
        for (const o of ROLE_OPTIONS) {
            const op = document.createElement("option");
            op.value = o.value;
            op.textContent = o.label;
            sel.appendChild(op);
        }
        sel.value = b.role;
        sel.addEventListener("change", () => {
            const next = blockList();
            next[i].role = sel.value;
            setBlocks(next, false);
        });
        foot.appendChild(sel);
        if (holdsTurn)
            foot.appendChild(el("span", "arf-pill", "holds the turn"));
        const drop = button("Delete", false);
        drop.className += " arf-danger";
        drop.setAttribute("aria-label", "Delete " + blockLabel(b));
        drop.addEventListener("click", () => {
            const next = blockList();
            next.splice(i, 1);
            setBlocks(next);
        });
        foot.appendChild(drop);
        wrap.appendChild(foot);
        return wrap;
    }
    // What a block can say, and who answers it. On screen rather than in a
    // document, because the block editor is for writing these, and a macro whose
    // name you cannot remember is a macro you do not use.
    function buildMacroCard() {
        const wrap = card("Macros you can use", "Anything in double braces is filled in at the moment of the refine. Tap one to copy it.");
        wrap.appendChild(fold("The list", (body) => {
            for (const m of MACROS) {
                const row = el("div", "arf-col");
                const head = el("div", "arf-row");
                const tag = button(m.tag, false);
                tag.className += " arf-mono";
                tag.setAttribute("aria-label", "Copy " + m.tag);
                tag.addEventListener("click", () => {
                    copyText(m.tag);
                    toast("Copied " + m.tag, true);
                });
                head.appendChild(tag);
                if (!m.ours)
                    head.appendChild(el("span", "arf-pill", "Lumiverse"));
                row.appendChild(head);
                row.appendChild(note(m.what));
                body.appendChild(row);
            }
            body.appendChild(note("The ones marked Lumiverse are the host's own, so anything you already use in a character card or a preset works here too. A macro nobody can answer is left as you typed it rather than being blanked."));
        }));
        return wrap;
    }
    function buildContextCard() {
        const wrap = card("How much it is told", "What the {{history}} and {{lore}} macros carry. Every one of these costs tokens on every single refine, which is where a cheap feature quietly becomes an expensive one.");
        wrap.appendChild(fieldRow({
            key: "contextMessages",
            label: "Messages of run-up to send",
            type: "num",
            min: 0,
            max: 40,
            hint: "How many messages before the one being refined. 0 sends none, which is fine for rules about wording and wrong for rules about continuity.",
        }));
        wrap.appendChild(fieldRow({
            key: "maxHistoryTokens",
            label: "Most tokens of run-up",
            type: "num",
            min: 0,
            max: 200000,
            hint: "A ceiling on the same thing, in tokens. Whichever runs out first decides. Whole messages are kept or dropped, oldest first, so the turn just before the one being refined is always the one that survives.",
        }));
        wrap.appendChild(fieldRow({
            key: "maxLoreTokens",
            label: "Most tokens of lorebook",
            type: "num",
            min: 0,
            max: 200000,
            hint: "A ceiling on the entries this chat has active. Whole entries are kept or dropped. 0 sends none, which is the same as switching the block off.",
        }));
        wrap.appendChild(note("Counted with Lumiverse's own tokeniser where it will answer, and estimated at four characters a token where it will not."));
        return wrap;
    }
    // The request itself, exactly as it goes out. Built by the backend with the
    // same function a real refine uses, so this cannot become a nice description
    // of something the extension does not actually send.
    function buildPreviewCard() {
        const wrap = card("See what gets sent", "Builds the request for the reply you are looking at and shows it, message by message, without calling a model. Nothing is sent and nothing is charged.");
        const row = el("div", "arf-row");
        const go = button(preview ? "Build it again" : "Show me the request", false);
        go.setAttribute("data-arf-preview", "build");
        go.disabled = previewBusy;
        go.style.opacity = previewBusy ? "0.5" : "1";
        go.addEventListener("click", () => {
            previewBusy = true;
            preview = null;
            const id = newId();
            previewWaiting = id;
            send({
                type: "preview_prompt",
                requestId: id,
                chatId: lastChatId,
                messageId: lastMessageId,
            });
            paint();
        });
        row.appendChild(go);
        if (preview && preview.ok) {
            // Two ways to look at the same thing. Rendered is the readable one, block
            // by block. Raw is the JSON that goes over the wire, which is what you
            // want when you are asking somebody else why a request did something.
            const flip = button(previewRaw ? "Rendered" : "Raw", false);
            flip.setAttribute("data-arf-preview", "flip");
            flip.setAttribute("aria-label", previewRaw ? "Show it rendered" : "Show the raw request");
            flip.addEventListener("click", () => {
                previewRaw = !previewRaw;
                paint();
            });
            row.appendChild(flip);
        }
        if (preview) {
            const copy = button("Copy it", false);
            copy.addEventListener("click", () => {
                // Takes what is on screen, so the raw view copies the raw thing.
                copyText(previewRaw ? previewAsRaw(preview) : previewAsText(preview));
                toast("Copied.", true);
            });
            row.appendChild(copy);
            // A request is longer than a drawer is wide. This is the same text at the
            // size of the screen, to read rather than to edit.
            const big = button("Expand", false);
            big.setAttribute("aria-label", "Read the request at full size");
            big.addEventListener("click", () => {
                openBig(previewRaw ? "The request, as data" : "The request", previewRaw ? previewAsRaw(preview) : previewAsText(preview));
            });
            row.appendChild(big);
        }
        wrap.appendChild(row);
        if (previewBusy) {
            wrap.appendChild(note("Building..."));
            return wrap;
        }
        if (!preview)
            return wrap;
        if (!preview.ok) {
            wrap.appendChild(el("div", "arf-well arf-dim", String(preview.why || "It could not be built.")));
            return wrap;
        }
        const msgs = Array.isArray(preview.messages) ? preview.messages : [];
        let chars = 0;
        for (const m of msgs)
            chars += String((m && m.content) || "").length;
        if (previewRaw) {
            wrap.appendChild(note(msgs.length +
                (msgs.length === 1 ? " message, " : " messages, ") +
                chars.toLocaleString() +
                " characters. This is the request as it goes out."));
            wrap.appendChild(el("div", "arf-well arf-scroll arf-mono arf-tall", previewAsRaw(preview)));
            return wrap;
        }
        wrap.appendChild(note(msgs.length +
            (msgs.length === 1 ? " message, " : " messages, ") +
            chars.toLocaleString() +
            " characters" +
            (preview.real ? "" : ", with a stand-in where your reply would go, since no reply was found on screen")));
        for (const m of msgs) {
            const one = el("div", "arf-block");
            const head = el("div", "arf-between");
            head.appendChild(el("span", "arf-lab arf-mono", String((m && m.role) || "system")));
            head.appendChild(el("span", "arf-pill arf-mono", String((m && m.content) || "").length + " chars"));
            one.appendChild(head);
            one.appendChild(el("div", "arf-well arf-scroll arf-mono", String((m && m.content) || "")));
            wrap.appendChild(one);
        }
        // The rest of the call, which is part of what gets sent and is otherwise
        // spread across two other tabs.
        const extras = [];
        extras.push("Connection: " +
            (preview.connectionId
                ? (connections.find((c) => c.id === preview.connectionId) || {}).name ||
                    preview.connectionId
                : "the one you are chatting with"));
        extras.push("Thinking: " +
            (!preview.reasoning
                ? "whatever your connection is set to"
                : preview.reasoning.source === "off"
                    ? "off"
                    : "on, " + String(preview.reasoning.effort || "medium") + " effort"));
        extras.push("Samplers: " +
            (preview.parameters
                ? Object.keys(preview.parameters)
                    .map((k) => k + " " + preview.parameters[k])
                    .join(", ")
                : "left to the connection"));
        wrap.appendChild(el("div", "arf-well arf-dim arf-mono", extras.join("\n")));
        return wrap;
    }
    // The request as JSON, which is what a provider is actually handed.
    function previewAsRaw(p) {
        try {
            const body = { messages: Array.isArray(p.messages) ? p.messages : [] };
            if (p.connectionId)
                body.connection_id = p.connectionId;
            if (p.parameters)
                body.parameters = p.parameters;
            if (p.reasoning)
                body.reasoning = p.reasoning;
            return JSON.stringify(body, null, 2);
        }
        catch (_) {
            return "This request could not be laid out as data. The rendered view still has it.";
        }
    }
    function previewAsText(p) {
        const msgs = Array.isArray(p && p.messages) ? p.messages : [];
        return msgs
            .map((m) => "[" + String((m && m.role) || "") + "]\n" + String((m && m.content) || ""))
            .join("\n\n");
    }
    // ---- Model ----
    function buildConnectionCard() {
        const wrap = card("Which model refines", "A refine is a second model call on every reply, so these decide what it costs. They default to the cheap answer.");
        for (const f of COST_FIELDS)
            wrap.appendChild(fieldRow(f));
        if (lostConnection())
            wrap.appendChild(bad("The connection this is pointed at is not on your account any more, so nothing can be refined until you pick another one above."));
        return wrap;
    }
    // Named setups for the Model tab, so somebody running more than one custom
    // connection can move between them in one go rather than resetting five
    // fields by hand every time.
    function buildSetupCard() {
        const wrap = card("Saved model setups", "Everything on this tab under one name: the connection, the thinking, how long to wait, and the samplers. Your prompt is not in here, so loading one changes what runs the refine and nothing about how it reads. Kept in this browser and in your account, and not offered as a file: a connection id names nothing on anybody else's account.", setups.length ? String(setups.length) : undefined);
        const chosen = () => setups.find((x) => x.name === setupPick) || null;
        const sel = document.createElement("select");
        sel.className = "arf-field";
        sel.setAttribute("aria-label", "Saved model setups");
        sel.setAttribute("data-arf-field", "setupPick");
        const none = document.createElement("option");
        none.value = "";
        none.textContent = setups.length ? "Pick a setup" : "Nothing saved yet";
        sel.appendChild(none);
        for (const one of setups) {
            const op = document.createElement("option");
            op.value = one.name;
            op.textContent = one.name;
            sel.appendChild(op);
        }
        sel.value = setupPick;
        sel.addEventListener("change", () => {
            setupPick = sel.value;
            setupName = sel.value;
            setupSaid = null;
            paint();
        });
        wrap.appendChild(sel);
        const nameIn = document.createElement("input");
        nameIn.type = "text";
        nameIn.className = "arf-field";
        nameIn.placeholder = "A name for this setup";
        nameIn.value = setupName;
        nameIn.setAttribute("aria-label", "Setup name");
        nameIn.setAttribute("data-arf-field", "setupName");
        nameIn.addEventListener("input", () => {
            setupName = nameIn.value;
        });
        wrap.appendChild(nameIn);
        const row = el("div", "arf-row");
        const load = button("Load", false);
        load.setAttribute("data-arf-setup", "load");
        load.disabled = !chosen();
        load.style.opacity = load.disabled ? "0.45" : "1";
        load.addEventListener("click", () => {
            const one = chosen();
            if (!one)
                return;
            const took = applySetup(one);
            setupSaid = took ? "Loaded " + one.name + "." : "There was nothing in that setup to load.";
            log("loaded the model setup " + one.name, true);
            paint();
        });
        const asNew = button("Save as new", false);
        asNew.setAttribute("data-arf-setup", "new");
        asNew.addEventListener("click", () => {
            const name = String(setupName || "").trim();
            if (!name) {
                setupSaid = "Give it a name first.";
                paint();
                return;
            }
            if (setups.some((x) => x.name === name)) {
                setupSaid = "There is already a setup called that. Use Update selected, or pick another name.";
                paint();
                return;
            }
            setups.push({ name: name, at: Date.now(), settings: setupFromNow() });
            setups = setups.slice(-40);
            saveSetups();
            setupPick = name;
            setupSaid = "Saved " + name + ".";
            paint();
        });
        const update = button("Update selected", false);
        update.setAttribute("data-arf-setup", "update");
        update.disabled = !chosen();
        update.style.opacity = update.disabled ? "0.45" : "1";
        update.addEventListener("click", () => {
            const one = chosen();
            if (!one)
                return;
            one.settings = setupFromNow();
            one.at = Date.now();
            saveSetups();
            setupSaid = "Updated " + one.name + ".";
            paint();
        });
        const rename = button("Rename selected", false);
        rename.setAttribute("data-arf-setup", "rename");
        rename.disabled = !chosen();
        rename.style.opacity = rename.disabled ? "0.45" : "1";
        rename.addEventListener("click", () => {
            const one = chosen();
            const name = String(setupName || "").trim();
            if (!one)
                return;
            if (!name) {
                setupSaid = "Put the new name in the box first.";
                paint();
                return;
            }
            if (name !== one.name && setups.some((x) => x.name === name)) {
                setupSaid = "There is already a setup called that.";
                paint();
                return;
            }
            one.name = name;
            saveSetups();
            setupPick = name;
            setupSaid = "Renamed.";
            paint();
        });
        const drop = button("Delete", false);
        drop.className += " arf-danger";
        drop.setAttribute("data-arf-setup", "delete");
        drop.disabled = !chosen();
        drop.style.opacity = drop.disabled ? "0.45" : "1";
        drop.addEventListener("click", () => {
            const one = chosen();
            if (!one)
                return;
            setups = setups.filter((x) => x !== one);
            saveSetups();
            setupPick = "";
            setupName = "";
            setupSaid = "Deleted " + one.name + ".";
            paint();
        });
        row.appendChild(load);
        row.appendChild(asNew);
        row.appendChild(update);
        row.appendChild(rename);
        row.appendChild(drop);
        wrap.appendChild(row);
        // What the chosen one would actually do, since the fields below are what
        // is loaded now and not what is about to be.
        const one = chosen();
        if (one) {
            const named = (id) => {
                if (!id)
                    return "the model you are chatting with";
                const c = connections.find((x) => x.id === id);
                return c ? (c.name || c.provider || "a connection") + (c.model ? " (" + c.model + ")" : "") : "a connection that is gone";
            };
            const set = SAMPLER_FIELDS.filter((f) => one.settings.samplers && one.settings.samplers[f.id] != null).length;
            wrap.appendChild(note("Refines with " + named(String(one.settings.connectionId || "")) + ". " +
                (one.settings.thinkingMode === "off"
                    ? "No thinking."
                    : one.settings.thinkingMode === "custom"
                        ? "Thinking on " + String(one.settings.thinkingEffort || "medium") + "."
                        : "Thinking left to the connection.") +
                (set ? " " + set + (set === 1 ? " sampler" : " samplers") + " set." : " Samplers left alone.")));
            if (setupLost(one))
                wrap.appendChild(warn("The connection this setup names is not on your account any more. Loading it would leave the refine pointed at nothing, so pick another connection above and update the setup."));
        }
        if (setupSaid)
            wrap.appendChild(note(setupSaid));
        return wrap;
    }
    function buildSamplerCard() {
        const set = SAMPLER_FIELDS.filter((s) => cfg.samplers && cfg.samplers[s.id] != null && cfg.samplers[s.id] !== "").length;
        const wrap = card("Samplers", "Left blank, the connection's own preset decides, which is what you want unless you have a reason. Fill one in and it is sent with the refine and only with the refine: your chat is not affected.", set ? set + " set" : "all default");
        wrap.appendChild(fold("Sampler values", (body) => {
            for (const s of SAMPLER_FIELDS)
                body.appendChild(samplerRow(s));
            const clear = button("Clear them all", false);
            clear.addEventListener("click", () => {
                cfg.samplers = {};
                persist(true);
                paint();
            });
            const clearRow = el("div", "arf-row");
            clearRow.appendChild(clear);
            body.appendChild(clearRow);
        }));
        return wrap;
    }
    function samplerRow(s) {
        const wrap = el("div", "arf-col");
        wrap.appendChild(el("div", "arf-lab", s.label));
        const box = document.createElement("input");
        box.type = "number";
        box.min = String(s.min);
        box.max = String(s.max);
        box.step = s.step;
        box.className = "arf-field";
        box.placeholder = "Leave to the connection";
        box.setAttribute("aria-label", s.label);
        box.setAttribute("data-arf-field", "sampler:" + s.id);
        const held = cfg.samplers && cfg.samplers[s.id];
        box.value = held == null || held === "" ? "" : String(held);
        box.addEventListener("change", () => {
            const next = Object.assign({}, cfg.samplers || {});
            const raw = String(box.value).trim();
            // Cleared means handing it back to the connection, which is not the same
            // as sending zero, so the key goes rather than being set to 0.
            if (!raw)
                delete next[s.id];
            else {
                let v = Number(raw);
                if (!Number.isFinite(v)) {
                    delete next[s.id];
                    box.value = "";
                }
                else {
                    v = Math.min(s.max, Math.max(s.min, v));
                    next[s.id] = v;
                    box.value = String(v);
                }
            }
            cfg.samplers = next;
            persist(true);
        });
        wrap.appendChild(box);
        if (s.hint)
            wrap.appendChild(note(s.hint));
        return wrap;
    }
    // ---- Limits ----
    function buildProtectCard() {
        const wrap = card("Protecting what is not prose", "Ask a model to improve a paragraph and it will happily drop a colour tag, reflow a code block, or decide an image link was a typo. None of that is writing, and none of it is the model's to touch.");
        wrap.appendChild(fieldRow({
            key: "protectOn",
            label: "Hide markup from the model",
            type: "bool",
            hint: "On by default. Tags, code and image links are lifted out and stood in for while the model works, then put back exactly as they were. A rewrite that lost one is dropped.",
        }));
        wrap.appendChild(fieldRow({
            key: "protectInline",
            label: "Hide plain italic and bold too",
            type: "bool",
            needs: { key: "protectOn" },
            hint: "Off by default. Tags like <i> and <b> wrap words in the middle of a sentence, and hiding them hands the model a sentence with holes in it. Anything carrying an attribute is hidden either way.",
        }));
        wrap.appendChild(fieldRow({
            key: "protectThinking",
            label: "Keep the reply's own reasoning out of the refine",
            type: "bool",
            hint: "On by default. Working the character's model left in the reply is not your writing, so it is cut out before the refine and put back after rather than being rewritten.",
        }));
        wrap.appendChild(fieldRow({
            key: "stripAnswerThinking",
            label: "Keep the refiner's own reasoning out of your chat",
            type: "bool",
            hint: "On by default, and the other direction from the row above. A refining model that thinks out loud can have that working saved into your chat as part of the rewrite, which this stops.",
        }));
        // Folded. Three lists of text that most readers never open, sitting in
        // front of the switches everybody does. A search still reaches inside,
        // because fold opens itself while one is running.
        if (cfg.protectThinking)
            wrap.appendChild(fold("Reasoning tag names your model uses", (body) => {
                body.appendChild(fieldRow({
                    key: "thinkTags",
                    label: "Extra reasoning tag names",
                    type: "lines",
                    hint: "Optional, one per line, just the name with no brackets or pipes. The eight common wrappers are known already. Working that is not recognised is rewritten and saved over the reply.",
                }));
            }));
        if (cfg.protectOn)
            wrap.appendChild(fold("Patterns of your own", (body) => {
                for (const f of SHIELD_FIELDS)
                    body.appendChild(fieldRow({ ...f, needs: undefined, under: false }));
            }));
        if (shieldBad.length)
            wrap.appendChild(bad("These patterns could not be read and are doing nothing: " + shieldBad.join("; ")));
        if (!cfg.protectOn)
            wrap.appendChild(warn("With this off, a rewrite can quietly change or drop any formatting in your replies."));
        return wrap;
    }
    // Reading the answer, and watching it arrive. These sat in the protection
    // card, where they read as three more things being hidden from the model.
    // Nothing here hides anything.
    function buildReadCard() {
        const wrap = card("Reading the answer", "How the rewrite is taken out of what comes back, and whether you can watch it arrive.");
        wrap.appendChild(fieldRow({
            key: "wrapOutput",
            label: "Take the answer from between the tags",
            type: "bool",
            hint: "On by default. When the answer carries <REFINED> and </REFINED>, only what is between them is saved. Asking for the tags is your prompt's job, and off, the whole answer is taken as the rewrite.",
        }));
        wrap.appendChild(fieldRow({
            key: "streamProgress",
            label: "Say how much has come back",
            type: "bool",
            hint: "On by default. Streams the refine so the line under the switch can count what has arrived. The answer is judged when it is complete either way.",
        }));
        return wrap;
    }
    function buildGuardCard() {
        const wrap = card("What it refuses to save", "A model asked to rewrite prose sometimes answers with something else. A rewrite that fails one of these is dropped and the reply is left exactly as it was, and the Log says which one fired. Each is yours to switch off.");
        for (const f of LIMIT_FIELDS.filter((f) => f.key === "maxGrowthPct" || f.key === "minShrinkPct"))
            wrap.appendChild(fieldRow(f));
        // The switches stay in front. What each one measures by is a number and a
        // word list, which belong behind a fold with the rest of the tuning.
        for (const f of GUARD_FIELDS)
            if (!f.under)
                wrap.appendChild(fieldRow(f));
        const tuning = GUARD_FIELDS.filter((f) => f.under && fieldShows(f));
        if (tuning.length)
            wrap.appendChild(fold("What counts as sanitising", (body) => {
                // The condition is kept rather than stripped. The fold is only built
                // for the checks that are on, so nothing in here is hidden the moment
                // it is drawn, but switching one of those checks off should take its
                // tuning with it there and then rather than a moment later.
                for (const f of tuning)
                    body.appendChild(fieldRow({ ...f, under: false }));
            }));
        if (!cfg.guardRefusal && !cfg.guardPreamble && !cfg.guardSoften)
            wrap.appendChild(warn("Every check on what the answer says is off. A refusal written by the model can now be saved over your reply, and the length limits are all that is left."));
        return wrap;
    }
    function buildSafetyCard() {
        const wrap = card("Before it writes");
        for (const f of LIMIT_FIELDS.filter((f) => f.key !== "maxGrowthPct" && f.key !== "minShrinkPct" && f.key !== "toast"))
            wrap.appendChild(fieldRow(f));
        return wrap;
    }
    // Patterns the backend could not compile, named so a typo is visible instead
    // of being a region somebody believes is shielded and is not.
    let shieldBad = [];
    // Which try is running, for the line that says so.
    let retryAt = 0;
    let retryOf = 0;
    // What is happening right now, which the panel could not say before: it knew
    // it was busy and nothing else, so a refine that took forty seconds looked
    // the same as one that had quietly failed.
    function buildLiveCard() {
        const st = statusLine();
        const wrap = card("Right now", undefined, st.tone === "busy" ? "working" : st.text);
        const rows = [];
        rows.push(["Chat", lastChatId == null ? "none open" : String(lastChatId).slice(0, 8)]);
        rows.push(["Refines saved", String(tally.saved)]);
        rows.push(["Rewrites dropped", String(tally.dropped)]);
        rows.push(["Put back", String(tally.undone)]);
        if (lastRun)
            rows.push([
                "Last refine took",
                (lastRun.ms / 1000).toFixed(1) + "s, " + (lastRun.ok ? "saved" : "dropped"),
            ]);
        for (const [k, v] of rows) {
            const r = el("div", "arf-between");
            r.appendChild(el("span", "arf-note", k));
            r.appendChild(el("span", "arf-lab arf-mono", v));
            wrap.appendChild(r);
        }
        if (drops.size) {
            wrap.appendChild(el("div", "arf-rule"));
            wrap.appendChild(el("div", "arf-note", "Why rewrites were dropped"));
            const seen = Array.from(drops.entries()).sort((a, b) => b[1] - a[1]);
            for (const [why, n] of seen.slice(0, 6)) {
                const r = el("div", "arf-between");
                r.appendChild(el("span", "arf-note arf-grow", why));
                r.appendChild(el("span", "arf-pill arf-mono", String(n)));
                wrap.appendChild(r);
            }
        }
        return wrap;
    }
    // What the model worked out on the way to the last refine that finished.
    //
    // The card on the page shows this while it is being written and then the
    // before and after lands on top of it, which is a second of reading for
    // something worth more than a second. This is where it waits afterwards.
    function buildNotesCard() {
        const wrap = card("What the model worked out", undefined, keptNotes ? (keptNotes.ok ? "saved" : "dropped") : undefined);
        if (!keptNotes) {
            wrap.appendChild(note(asksForWorking()
                ? "Nothing yet. The working from the last refine that finishes lands here, and a refine you stop leaves what is already here alone."
                : "The prompt you are on does not ask the model for its working, so there is none to keep. The two for a model that thinks ask for it."));
            return wrap;
        }
        const when = new Date(keptNotes.at).toTimeString().slice(0, 8);
        const whose = keptNotes.mine ? "your draft" : "a reply";
        wrap.appendChild(note(keptNotes.ok
            ? "From the refine of " + whose + " at " + when + "."
            : "From the refine of " + whose + " at " + when +
                ", whose rewrite was dropped: " + keptNotes.why + "."));
        const well = el("div", "arf-well arf-mono arf-scroll");
        well.setAttribute("data-arf-kept", "1");
        well.textContent = readable(keptNotes.text);
        wrap.appendChild(well);
        const row = el("div", "arf-row");
        const copy = button("Copy", false);
        // What is on the screen. Copying the tags out of a card that does not show
        // them would be handing over something else.
        copy.addEventListener("click", () => {
            copyText(keptNotes ? readable(keptNotes.text) : "");
        });
        const clear = button("Clear", false);
        clear.addEventListener("click", () => {
            keptNotes = null;
            paint();
        });
        row.appendChild(copy);
        row.appendChild(clear);
        wrap.appendChild(row);
        return wrap;
    }
    function buildActivityCard() {
        const wrap = card("What it has been doing", undefined, activity.length ? String(activity.length) : undefined);
        if (!activity.length) {
            wrap.appendChild(note("Nothing yet."));
            return wrap;
        }
        for (const a of activity) {
            const row = el("div", "arf-row arf-note arf-mono");
            row.appendChild(el("span", "arf-when", new Date(a.at).toTimeString().slice(0, 8)));
            row.appendChild(el("span", "arf-said arf-grow" + (a.good ? "" : " arf-dim"), a.text));
            wrap.appendChild(row);
        }
        return wrap;
    }
    function buildDebugCard() {
        const chosen = DEBUG_PARTS.filter((p) => partOn("debugParts", p.id)).length;
        const wrap = card("Reporting a problem", "Everything somebody would otherwise have to ask you for, in one paste. What your blocks say is never in it: it carries their names, roles and macros, not their text.", chosen + " of " + DEBUG_PARTS.length);
        const row = el("div", "arf-row");
        const copy = button("Copy it", true);
        copy.addEventListener("click", () => {
            copyText(debugText());
            toast("Copied.", true);
            log("copied debug info", true);
        });
        const read = button("Read and edit it first", false);
        read.addEventListener("click", () => {
            // Opened in the big editor rather than copied blind. Somebody pasting
            // this into a public issue should be able to read every line of it first,
            // and take out anything they would rather not post.
            openBig("Debug info", debugText(), (text) => {
                copyText(text);
                toast("Copied.", true);
                log("copied debug info", true);
            });
        });
        const clear = button("Clear the log", false);
        clear.className += " arf-danger";
        clear.addEventListener("click", () => {
            activity.length = 0;
            drops.clear();
            tally.saved = 0;
            tally.dropped = 0;
            tally.undone = 0;
            lastRun = null;
            log("cleared the log", true);
            paint();
        });
        row.appendChild(copy);
        row.appendChild(read);
        row.appendChild(clear);
        wrap.appendChild(row);
        wrap.appendChild(fold("What it carries", (body) => {
            body.appendChild(partsPicker("debugParts", DEBUG_PARTS));
        }));
        wrap.appendChild(fold("Read it here", (body) => {
            body.appendChild(el("div", "arf-well arf-scroll arf-mono", debugText()));
        }));
        return wrap;
    }
    // Settings and counts, never your writing. A bug report should be safe to
    // paste in public, and a rules box can hold anything.
    // Settings and counts, never your writing. A bug report should be safe to
    // paste in public, and a block can hold anything.
    function debugText() {
        const on = (id) => partOn("debugParts", id);
        const lines = [];
        lines.push("Auto Refine " + VERSION);
        lines.push("when: " + new Date().toISOString());
        if (on("chat")) {
            lines.push("");
            lines.push("[where]");
            lines.push("chat open: " +
                (outsideAnyChat() ? "no, outside a chat" : lastChatId == null ? "not known yet" : "yes"));
            lines.push("character: " + (character ? "named" : nameWithheld ? "withheld, no permission" : "none"));
            lines.push("off in this chat: " + (chatIsOff(lastChatId) ? "yes" : "no"));
            lines.push("chats switched off: " + chatsOff.length);
        }
        if (on("settings")) {
            lines.push("");
            lines.push("[settings]");
            lines.push("on: " + (cfg.enabled ? "yes" : "no") + ", automatic: " + (cfg.refineOn ? "yes" : "no"));
            lines.push("connection: " +
                (cfg.connectionId ? "picked" : "the chat's own") +
                ", connections seen: " +
                connections.length);
            lines.push("thinking: " +
                cfg.thinkingMode +
                (cfg.thinkingMode === "custom" ? " (" + cfg.thinkingEffort + ")" : "") +
                ", timeout: " +
                (waitCap() ? waitCap() + "s" : "off"));
            lines.push("run-up: " +
                cfg.contextMessages +
                " messages, " +
                cfg.maxHistoryTokens +
                " tokens; lore " +
                cfg.maxLoreTokens +
                " tokens");
            const set = SAMPLER_FIELDS.filter((f) => cfg.samplers && cfg.samplers[f.id] != null && cfg.samplers[f.id] !== "");
            lines.push("samplers: " + (set.length ? set.map((f) => f.id + "=" + cfg.samplers[f.id]).join(", ") : "all default"));
            lines.push("limits: grow " +
                cfg.maxGrowthPct +
                "%, shrink " +
                cfg.minShrinkPct +
                "%, keep original " +
                (cfg.keepOriginal ? "yes" : "no") +
                ", ask first " +
                (cfg.confirmBeforeSave ? "yes" : "no"));
            lines.push("protect markup: " +
                (cfg.protectOn ? "yes" : "no") +
                ", protect thinking: " +
                (cfg.protectThinking ? "yes" : "no") +
                ", answer in tags: " +
                (cfg.wrapOutput ? "yes" : "no"));
            lines.push("your own messages: refined only when you ask, never automatically");
            lines.push("widget: " +
                (cfg.widgetOn ? (widgetFailed ? "on but refused" : "on") : "off") +
                ", input bar: " +
                (cfg.inputRefine ? "on" : "off") +
                ", sound: " +
                (cfg.soundOn ? (hasSound() ? "on" : "on but none chosen") : "off"));
            lines.push("presets saved: " + presets.length);
        }
        if (on("prompt")) {
            lines.push("");
            lines.push("[prompt shape]");
            const list = blockList("blocks");
            const yours = blockList("userBlocks");
            lines.push("blocks: " + list.length + ", on: " + list.filter((b) => b.on).length);
            lines.push("own-messages prompt: " +
                (Array.isArray(cfg.userBlocks) && cfg.userBlocks.length
                    ? yours.length + " blocks of your own"
                    : "the default"));
            for (const b of list) {
                // Names, roles and macros. Never the text: a block can hold anything,
                // and a bug report should be safe to paste where anyone can read it.
                const found = String(b.text || "").match(/\{\{\s*[a-z_]+\s*\}\}/gi) || [];
                lines.push("  " +
                    (b.on ? "on " : "off") +
                    " " +
                    b.role.padEnd(9) +
                    " " +
                    String(b.name || b.id).slice(0, 28).padEnd(28) +
                    " " +
                    String(b.text || "").length +
                    " chars" +
                    (found.length ? "  " + found.join(" ") : ""));
            }
            if (noTurn())
                lines.push("  NOTE: no block carries {{message}}");
            if (!holdsTurn(yours))
                lines.push("  NOTE: the own-messages prompt carries no {{message}}");
        }
        if (on("counts")) {
            lines.push("");
            lines.push("[counts this session]");
            lines.push("saved: " + tally.saved + ", dropped: " + tally.dropped + ", put back: " + tally.undone);
            if (lastRun)
                lines.push("last refine: " +
                    (lastRun.ms / 1000).toFixed(1) +
                    "s, " +
                    (lastRun.ok ? "saved" : "dropped: " + lastRun.why));
            if (drops.size) {
                lines.push("drops by reason:");
                for (const [why, n] of Array.from(drops.entries()).sort((a, b) => b[1] - a[1]))
                    lines.push("  " + n + "x " + why);
            }
        }
        if (on("log") && activity.length) {
            lines.push("");
            lines.push("[recent]");
            for (const a of activity.slice(0, 12))
                lines.push("  " + new Date(a.at).toTimeString().slice(0, 8) + " " + a.text);
        }
        if (on("browser")) {
            lines.push("");
            lines.push("[browser]");
            try {
                const nav = globalThis.navigator;
                lines.push("agent: " + String((nav && nav.userAgent) || "unknown"));
                lines.push("screen: " +
                    String(globalThis.innerWidth || "?") +
                    "x" +
                    String(globalThis.innerHeight || "?") +
                    ", touch: " +
                    (nav && nav.maxTouchPoints > 0 ? "yes" : "no"));
            }
            catch (_) {
                lines.push("agent: could not be read");
            }
        }
        if (lines.length <= 2)
            lines.push("", "Nothing is switched on under What it carries.");
        return lines.join("\n");
    }
    function copyText(text) {
        try {
            const nav = globalThis.navigator;
            if (nav && nav.clipboard && typeof nav.clipboard.writeText === "function") {
                nav.clipboard.writeText(text).catch(() => fallbackCopy(text));
                return;
            }
        }
        catch (_) { }
        fallbackCopy(text);
    }
    // For a page without the clipboard API, or one that refuses it because the
    // click was not close enough to a user gesture.
    function fallbackCopy(text) {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.cssText = "position:fixed;top:-1000px;left:-1000px;opacity:0";
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand("copy");
            }
            catch (_) { }
            document.body.removeChild(ta);
        }
        catch (_) { }
    }
    // ---- Setup ----
    // What the host is letting it do, and what each refusal costs. Refusing one
    // is a choice somebody is allowed to make, so this names the cost once and
    // does not nag: when everything is granted it says so in one line.
    function buildPermsCard() {
        const gone = missing();
        const wrap = card("What it is allowed to do", undefined, granted ? (gone.length ? gone.length + " refused" : "all granted") : "asking");
        if (!granted) {
            wrap.appendChild(note("Waiting for Lumiverse to say. This usually answers at once."));
            return wrap;
        }
        if (!gone.length) {
            wrap.appendChild(notice("good", "Everything it asks for is granted, so nothing here is held back."));
            return wrap;
        }
        // The two it cannot work without are said loudly. The rest are a cost
        // rather than a fault, and are said plainly.
        for (const p of gone)
            wrap.appendChild(p.fatal
                ? bad(p.label + " is refused. " + p.without)
                : warn(p.label + " is refused. " + p.without));
        wrap.appendChild(note("Grant any of these in Lumiverse's own extension settings. Nothing here needs a reload: the panel notices the moment one changes."));
        wrap.appendChild(fold("What each one is for", (body) => {
            for (const p of PERMS) {
                const row = el("div", "arf-between");
                row.appendChild(el("span", "arf-lab arf-grow", p.label));
                row.appendChild(el("span", "arf-pill", hasPerm(p.id) ? "granted" : "refused"));
                body.appendChild(row);
                body.appendChild(note(p.why + " Without it: " + p.without.toLowerCase()));
            }
        }));
        return wrap;
    }
    function buildChatCard() {
        const known = lastChatId != null;
        const temp = isTemporary(lastChatId);
        const wrap = card("This chat", undefined, temp ? "temporary" : undefined);
        const top = el("div", "arf-between");
        top.appendChild(el("span", "arf-lab", "Auto Refine here"));
        const off = chatIsOff(lastChatId);
        const act = button(off ? "Turn on here" : "Turn off here", false);
        act.disabled = !known;
        act.style.opacity = known ? "1" : "0.45";
        act.style.cursor = known ? "pointer" : "not-allowed";
        act.addEventListener("click", () => setChatOff(lastChatId, !off));
        top.appendChild(act);
        wrap.appendChild(top);
        // Which chat, by name where there is one. A chat id is not an answer to
        // "which chat is this", and a card the characters permission was refused
        // for is a different thing from a chat with no card on it.
        if (known) {
            const who = character
                ? "You are in " + character + "'s chat."
                : nameWithheld
                    ? "This chat has a character on it. Its name needs the characters permission, which is not granted."
                    : temp
                        ? "This is a temporary chat, so there is no character card to send. A refine goes without that block, which is what you want here: there is no character voice to keep."
                        : "This chat has no character card on it, which is fine: a refine just goes without that block.";
            wrap.appendChild(note(who));
        }
        wrap.appendChild(note(!known
            ? outsideAnyChat()
                ? "You are not in a chat. Open one and this switch comes back."
                : "Waiting to be told which chat you are in."
            : off
                ? temp
                    ? "Auto Refine is off in this temporary chat. Every other chat carries on as it is. This lasts while the chat is open and is not remembered, since the chat itself is not kept."
                    : "Auto Refine is switched off in this chat. Every other chat carries on as it is."
                : temp
                    ? "Switch Auto Refine off for this temporary chat. It lasts while the chat is open and is not remembered, since the chat itself is not kept."
                    : "Leave one chat completely alone while every other chat carries on."));
        if (chatsOff.length) {
            const row = el("div", "arf-between");
            row.appendChild(el("span", "arf-note arf-grow", chatsOff.length + " chat" + (chatsOff.length === 1 ? "" : "s") + " switched off"));
            const all = button("Turn them all back on", false);
            all.addEventListener("click", () => {
                chatsOff = [];
                saveChatsOff();
                paint();
            });
            row.appendChild(all);
            wrap.appendChild(row);
        }
        return wrap;
    }
    function buildAlertCard() {
        const wrap = card("When a refine lands", "How you find out, other than the tab's badge.");
        wrap.appendChild(fieldRow({
            key: "popup",
            label: "Show the before and after on screen",
            type: "bool",
            hint: "On by default. A card comes up on the page itself when a refine lands, with what the reply said before, what it says now, and a button to put it back. It closes when you answer it, and the refine stays in the Log either way, so closing it loses nothing.",
        }));
        wrap.appendChild(fieldRow({
            key: "toast",
            label: "Show a brief message",
            type: "bool",
            hint: "On by default. The one-line note Lumiverse shows at the edge of the screen. Separate from the card above: this one says a refine happened, that one says what it did.",
        }));
        wrap.appendChild(fieldRow({
            key: "soundOn",
            label: "Play a sound",
            type: "bool",
            hint: "Off by default. With nothing else chosen it plays a short built-in blip, which is synthesised in the browser, with no file to ship. Attach your own below if you would rather.",
        }));
        if (cfg.soundOn) {
            if (!hasSound())
                wrap.appendChild(note("Using the built-in blip. Attach a file or paste a link below to use your own."));
            const attached = /^data:/.test(String(cfg.soundUrl || ""));
            const picker = document.createElement("input");
            picker.type = "file";
            picker.accept = "audio/*";
            picker.style.display = "none";
            picker.addEventListener("change", () => {
                const file = picker.files && picker.files[0];
                picker.value = "";
                if (!file)
                    return;
                if (file.size > SOUND_MAX) {
                    soundSaid =
                        "That file is " +
                            Math.round(file.size / 1024) +
                            "KB, over the " +
                            Math.round(SOUND_MAX / 1024) +
                            "KB limit. A short notification sound is well under it.";
                    paint();
                    return;
                }
                readFileAsDataUrl(file, (url) => {
                    if (!url || !/^data:audio\//.test(url)) {
                        soundSaid = "That file could not be read as audio.";
                    }
                    else {
                        cfg.soundUrl = url;
                        persist(true);
                        soundSaid = "Attached " + file.name + ".";
                    }
                    paint();
                });
            });
            const row = el("div", "arf-row");
            const pick = button(attached ? "Attach another file" : "Attach a file", false);
            pick.addEventListener("click", () => {
                try {
                    picker.click();
                }
                catch (_) {
                    soundSaid = "The browser would not open a file picker.";
                    paint();
                }
            });
            const tryIt = button("Play it", false);
            tryIt.addEventListener("click", () => {
                soundSaid = null;
                ping(true);
            });
            row.appendChild(pick);
            row.appendChild(tryIt);
            if (hasSound()) {
                const drop = button("Back to the built-in", false);
                drop.addEventListener("click", () => {
                    cfg.soundUrl = "";
                    persist(true);
                    soundSaid = "Back to the built-in blip.";
                    paint();
                });
                row.appendChild(drop);
            }
            row.appendChild(picker);
            wrap.appendChild(row);
            wrap.appendChild(note("An attached file is held with your settings as text, so it has to be small: " +
                Math.round(SOUND_MAX / 1024) +
                "KB at most. A link is not, and is the better answer for anything bigger."));
            const link = document.createElement("input");
            link.type = "text";
            link.className = "arf-field";
            link.placeholder = "Or paste a link to a sound";
            link.setAttribute("aria-label", "Link to a sound");
            link.setAttribute("data-arf-field", "soundLink");
            link.value = attached ? "" : String(cfg.soundUrl || "");
            link.addEventListener("change", () => {
                const v = String(link.value || "").trim();
                if (!v) {
                    if (!attached) {
                        cfg.soundUrl = "";
                        persist(true);
                        soundSaid = null;
                    }
                    paint();
                    return;
                }
                // Only a link a browser can actually load, and never one that runs
                // something: a sound is fetched, not executed.
                if (!/^https?:\/\//i.test(v) && !/^data:audio\//i.test(v)) {
                    soundSaid = "That does not look like a link. It has to start with http:// or https://.";
                    paint();
                    return;
                }
                cfg.soundUrl = v;
                persist(true);
                soundSaid = "Using that link.";
                paint();
            });
            wrap.appendChild(link);
            if (attached)
                wrap.appendChild(note("A file is attached. Clear it above to use a link instead."));
            wrap.appendChild(fieldRow({
                key: "soundVolume",
                label: "How loud (%)",
                type: "num",
                min: 0,
                max: 100,
                hint: "",
            }));
            if (soundSaid)
                wrap.appendChild(note(soundSaid));
        }
        return wrap;
    }
    // Ways in other than the drawer. Both are off until asked for, because an
    // extension that adds a floating button and an input bar row on install is
    // one that redecorated somebody's screen without asking.
    function buildReachCard() {
        const wrap = card("Ways to reach it", "The drawer tab is always there. These are extra.");
        wrap.appendChild(fieldRow({
            key: "widgetOn",
            label: "A floating button",
            type: "bool",
            hint: "A small round button over the chat that refines the latest reply in one tap, and can be dragged where you want it. Hold it, or right click it, for the menu. Needs the interface panels permission.",
        }));
        if (cfg.widgetOn && widgetFailed)
            wrap.appendChild(bad("The floating button could not be created. Check that the interface panels permission is granted."));
        // Its own settings, which are only shown while it is on. Built either way,
        // so switching the button on brings them out where they stand rather than
        // waiting for the panel to be built again around them.
        for (const f of WIDGET_FIELDS)
            wrap.appendChild(fieldRow(f));
        wrap.appendChild(fieldRow({
            key: "inputRefine",
            label: "Refining the draft in your input box",
            type: "bool",
            hint: "Off by default, since it writes into the box you are typing in. On, a Refine what I am typing button joins the two above the tabs, and a row for it appears in the chat input's Extras menu or in the floating button's menu, whichever is on screen.",
        }));
        if (cfg.inputRefine)
            wrap.appendChild(note("Refining what you are typing reaches into the page rather than going through an API, because Lumiverse does not offer one for the input box. It is the only part of this extension that depends on how Lumiverse is laid out. If an update ever moves that box, it stops working and nothing else does."));
        return wrap;
    }
    // ---- carrying a setup somewhere else ----
    // One file with everything in it: the rules, the layout, the samplers, the
    // lot. Not the chats you switched off, which name chats that do not exist on
    // the machine reading the file.
    function buildTransferCard() {
        const wrap = card("Your whole setup", "A file with your rules, your prompt layout and your sampler settings in it. Importing replaces what you have here, so export first if you want a way back.");
        const row = el("div", "arf-row");
        const out = button("Export to a file", false);
        out.addEventListener("click", () => {
            const settings = {};
            for (const k of keysFor("exportParts"))
                settings[k] =
                    k === "blocks" || k === "userBlocks"
                        ? blockList(k).map((b) => ({ ...b }))
                        : cfg[k];
            const body = {
                extension: "auto-refine",
                version: VERSION,
                savedAt: new Date().toISOString(),
                // What is in the file, named. A file that carries half your setup and
                // does not say so is one somebody imports and then wonders about.
                parts: transferParts()
                    .filter((p) => partOn("exportParts", p.id))
                    .map((p) => p.id),
                settings: settings,
            };
            if (partOn("exportParts", PART_PRESETS))
                body.presets = presets;
            if (partOn("exportParts", PART_SETUPS))
                body.setups = setups;
            if (partOn("exportParts", PART_CHATS))
                body.chatsOff = chatsOff.slice();
            if (!Object.keys(settings).length && !body.presets && !body.chatsOff) {
                transferSaid = "Nothing is chosen, so there would be nothing in the file.";
                paint();
                return;
            }
            const ok = downloadText("auto-refine-settings.json", JSON.stringify(body, null, 2));
            transferSaid = ok
                ? "Exported " + body.parts.length + " part" + (body.parts.length === 1 ? "" : "s") + "."
                : "The browser would not save the file. Some private windows block downloads.";
            paint();
        });
        const picker = document.createElement("input");
        picker.type = "file";
        picker.accept = "application/json,.json";
        picker.style.display = "none";
        picker.addEventListener("change", () => {
            const file = picker.files && picker.files[0];
            picker.value = "";
            if (!file)
                return;
            readFileAsText(file, (text) => {
                transferSaid = applyImport(text);
                paint();
            });
        });
        const inBtn = button("Import a file", false);
        inBtn.addEventListener("click", () => {
            try {
                picker.click();
            }
            catch (_) {
                transferSaid = "The browser would not open a file picker.";
                paint();
            }
        });
        row.appendChild(out);
        row.appendChild(inBtn);
        row.appendChild(picker);
        wrap.appendChild(row);
        if (transferSaid)
            wrap.appendChild(note(transferSaid));
        wrap.appendChild(fold("What goes in the file", (body) => {
            body.appendChild(partsPicker("exportParts", transferParts()));
        }));
        wrap.appendChild(fold("What to take from a file", (body) => {
            body.appendChild(note("A file can hold more than you want back. Anything switched off here is skipped, whatever the file contains."));
            body.appendChild(partsPicker("importParts", transferParts()));
        }));
        // The other half of the same subject: this card is about your setup as a
        // whole, and throwing it away belongs next to carrying it somewhere.
        buildResetInto(wrap);
        return wrap;
    }
    // Reads a file back into the settings. Every value is checked against what it
    // is supposed to be rather than assigned: this is a file somebody was handed,
    // and one bad field should not leave the panel in a state it cannot repaint.
    function applyImport(text) {
        if (!text)
            return "That file could not be read.";
        let body = null;
        try {
            body = JSON.parse(text);
        }
        catch (_) {
            return "That file is not settings JSON.";
        }
        const s = body && body.settings && typeof body.settings === "object" ? body.settings : body;
        if (!s || typeof s !== "object")
            return "That file has no settings in it.";
        if (body && body.extension && body.extension !== "auto-refine")
            return "That file is for a different extension.";
        // Only the keys the chosen parts cover. Everything else in the file is
        // read past, so a file carrying somebody's whole setup can be used to take
        // just their prompt.
        const wanted = keysFor("importParts");
        let took = 0;
        for (const key of Object.keys(CONFIG)) {
            if (wanted.indexOf(key) < 0)
                continue;
            if (!(key in s))
                continue;
            const want = CONFIG[key];
            const got = s[key];
            if (key === "blocks" || key === "userBlocks") {
                if (!Array.isArray(got))
                    continue;
                cfg[key] = got
                    .filter((b) => b && typeof b === "object" && b.id)
                    .slice(0, 40)
                    .map((b) => ({
                    id: String(b.id),
                    on: b.on !== false,
                    role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
                    text: b.text == null ? "" : String(b.text),
                    name: b.name == null ? "" : String(b.name),
                }));
                took++;
            }
            else if (key === "samplers") {
                if (!got || typeof got !== "object" || Array.isArray(got))
                    continue;
                const clean = {};
                for (const f of SAMPLER_FIELDS) {
                    const v = Number(got[f.id]);
                    if (got[f.id] === "" || got[f.id] == null || !Number.isFinite(v))
                        continue;
                    clean[f.id] = Math.min(f.max, Math.max(f.min, v));
                }
                cfg.samplers = clean;
                took++;
            }
            else if (key === "soundUrl") {
                // A sound arrives as a data URL and could be anything. Only audio, and
                // only up to the same cap the picker enforces.
                if (typeof got !== "string")
                    continue;
                cfg.soundUrl = /^data:audio\//.test(got) && got.length <= SOUND_MAX * 2 ? got : "";
                took++;
            }
            else if (typeof want === "boolean") {
                cfg[key] = !!got;
                took++;
            }
            else if (typeof want === "number") {
                const v = Number(got);
                if (Number.isFinite(v)) {
                    cfg[key] = v;
                    took++;
                }
            }
            else if (typeof want === "string") {
                if (typeof got === "string") {
                    cfg[key] = got;
                    took++;
                }
            }
        }
        // The two that are not settings.
        const extra = [];
        if (partOn("importParts", PART_PRESETS) && Array.isArray(body.presets)) {
            const clean = body.presets
                .filter((x) => x && typeof x === "object" && x.name && !isBuiltIn(String(x.name)))
                .slice(0, 60)
                .map((x) => ({
                name: String(x.name),
                at: Number(x.at) || Date.now(),
                settings: x.settings && typeof x.settings === "object" ? x.settings : {},
            }));
            if (clean.length) {
                // Added to yours rather than replacing them: a file of somebody else's
                // presets should not take away your own.
                const names = presets.map((x) => x.name);
                for (const one of clean) {
                    while (names.indexOf(one.name) >= 0)
                        one.name = one.name + " (copy)";
                    names.push(one.name);
                    presets.push(one);
                }
                presets = presets.slice(-60);
                savePresets();
                extra.push(clean.length + " preset" + (clean.length === 1 ? "" : "s"));
            }
        }
        if (partOn("importParts", PART_SETUPS) && Array.isArray(body.setups)) {
            const clean = cleanSetups(body.setups);
            if (clean.length) {
                // Added rather than replacing, the same as presets.
                const names = setups.map((x) => x.name);
                for (const one of clean) {
                    while (names.indexOf(one.name) >= 0)
                        one.name = one.name + " (copy)";
                    names.push(one.name);
                    setups.push(one);
                }
                setups = setups.slice(-40);
                saveSetups();
                extra.push(clean.length + " model setup" + (clean.length === 1 ? "" : "s"));
            }
        }
        if (partOn("importParts", PART_CHATS) && Array.isArray(body.chatsOff)) {
            const ids = body.chatsOff.map((x) => String(x)).slice(0, 500);
            for (const id of ids)
                if (chatsOff.indexOf(id) < 0)
                    chatsOff.push(id);
            saveChatsOff();
            extra.push("the chats switched off");
        }
        if (!took && !extra.length)
            return wanted.length
                ? "Nothing in that file matched what you chose to take."
                : "Nothing is chosen under What to take from a file, so nothing was taken.";
        persist(true);
        syncExtras();
        const said = took ? took + " setting" + (took === 1 ? "" : "s") : "";
        return "Imported " + [said].concat(extra).filter(Boolean).join(", ") + ".";
    }
    // Save text as a file. False if the browser refused, which some private
    // windows do, and which is worth saying rather than looking like nothing
    // happened.
    function downloadText(filename, text) {
        try {
            const blob = new Blob([text], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try {
                    URL.revokeObjectURL(url);
                }
                catch (_) { }
            }, 1000);
            return true;
        }
        catch (_) {
            return false;
        }
    }
    function readFileAsText(file, cb) {
        try {
            const reader = new FileReader();
            reader.onload = () => cb(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => cb(null);
            reader.readAsText(file);
        }
        catch (_) {
            cb(null);
        }
    }
    function readFileAsDataUrl(file, cb) {
        try {
            const reader = new FileReader();
            reader.onload = () => cb(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => cb(null);
            reader.readAsDataURL(file);
        }
        catch (_) {
            cb(null);
        }
    }
    // ---- picking which parts ----
    // One builder for all four lists, so the checkbox that says "Your prompt"
    // means the same thing whether you are exporting it, importing it, resetting
    // it, or deciding what a bug report carries.
    //
    // An empty record means everything is on. That way a fresh install and
    // somebody who has never opened one of these behave the same, and the stored
    // value only ever holds a choice somebody actually made.
    function partOn(which, id) {
        const held = cfg[which];
        if (!held || typeof held !== "object")
            return true;
        return held[id] !== false;
    }
    function setPart(which, id, on) {
        const next = Object.assign({}, cfg[which] || {});
        next[id] = on;
        cfg[which] = next;
        persist(true);
    }
    function partsPicker(which, list, repaintOnChange) {
        const wrap = el("div", "arf-col");
        wrap.setAttribute("data-arf-picker", which);
        const chosen = list.filter((p) => partOn(which, p.id)).length;
        const bar = el("div", "arf-row");
        const all = button("All", false);
        all.className += " arf-mini2";
        all.setAttribute("data-arf-pick", "all");
        all.disabled = chosen === list.length;
        all.style.opacity = all.disabled ? "0.45" : "1";
        all.addEventListener("click", () => {
            const next = {};
            for (const p of list)
                next[p.id] = true;
            cfg[which] = next;
            persist(true);
            paint();
        });
        const none = button("None", false);
        none.className += " arf-mini2";
        none.setAttribute("data-arf-pick", "none");
        none.disabled = chosen === 0;
        none.style.opacity = none.disabled ? "0.45" : "1";
        none.addEventListener("click", () => {
            const next = {};
            for (const p of list)
                next[p.id] = false;
            cfg[which] = next;
            persist(true);
            paint();
        });
        bar.appendChild(el("span", "arf-note arf-grow", chosen + " of " + list.length + " chosen"));
        bar.appendChild(all);
        bar.appendChild(none);
        wrap.appendChild(bar);
        for (const p of list) {
            const row = el("div", "arf-col");
            const lab = document.createElement("label");
            lab.className = "arf-between";
            lab.style.cursor = "pointer";
            lab.appendChild(el("span", "arf-lab arf-grow", p.label));
            const box = document.createElement("input");
            box.type = "checkbox";
            box.className = "arf-box";
            box.checked = partOn(which, p.id);
            box.setAttribute("data-arf-part", which + ":" + p.id);
            box.setAttribute("aria-label", p.label);
            box.addEventListener("change", () => {
                setPart(which, p.id, !!box.checked);
                if (repaintOnChange !== false)
                    settle();
            });
            lab.appendChild(box);
            row.appendChild(lab);
            row.appendChild(note(p.what));
            wrap.appendChild(row);
        }
        return wrap;
    }
    // The settings parts plus the two that are not settings, which is the list
    // import, export and reset all offer.
    function transferParts() {
        return PARTS.map((p) => ({ id: p.id, label: p.label, what: p.what })).concat([
            {
                id: PART_PRESETS,
                label: "Saved presets",
                what: "The ones you saved. The four that ship with the extension are always there and are never in a file.",
            },
            {
                id: PART_SETUPS,
                label: "Saved model setups",
                what: "Which connection refines, and the thinking and samplers with it. A connection id names nothing on another account, so a setup that crosses one needs its connection picked again.",
            },
            {
                id: PART_CHATS,
                label: "Chats you switched off",
                what: "A list of chat ids. They name chats that will not exist on another machine, so this is off unless you are moving between browsers on the same account.",
            },
        ]);
    }
    // Which settings keys a chosen set of parts covers.
    function keysFor(which) {
        const out = [];
        for (const p of PARTS)
            if (partOn(which, p.id))
                out.push.apply(out, p.keys);
        return out;
    }
    // ---- the big editor ----
    // A block's text is a paragraph or two, and a four-row box in a drawer is a
    // letterbox to write one in. This opens the same text in something the size
    // of the screen.
    //
    // It does not focus the box on the way in. Focusing a textarea is what raises
    // the keyboard on a phone, which covers the thing you opened, and somebody
    // who wants to type will tap it anyway.
    let closeBig = null;
    // done is left out for a viewer: something to read at full size rather than
    // edit, which is what the preview wants.
    function openBig(label, initial, done) {
        if (typeof document === "undefined")
            return;
        if (closeBig) {
            try {
                closeBig();
            }
            catch (_) { }
        }
        const over = el("div", "arf-over");
        const box = el("div", "arf-bigbox arf");
        const head = el("div", "arf-between");
        head.appendChild(el("span", "arf-cardh arf-grow", label));
        box.appendChild(head);
        const ta = document.createElement("textarea");
        ta.className = "arf-field arf-mono arf-bigta";
        ta.value = initial;
        ta.setAttribute("aria-label", label);
        if (!done)
            ta.readOnly = true;
        box.appendChild(ta);
        const row = el("div", "arf-row");
        row.style.justifyContent = "flex-end";
        const copy = button("Copy", false);
        copy.addEventListener("click", () => {
            copyText(ta.value);
            toast("Copied.", true);
        });
        row.appendChild(copy);
        const cancel = button(done ? "Cancel" : "Close", false);
        row.appendChild(cancel);
        let save = null;
        if (done) {
            save = button("Done", true);
            row.appendChild(save);
        }
        box.appendChild(row);
        over.appendChild(box);
        const onKey = (e) => {
            if (e && e.key === "Escape")
                shut();
        };
        function shut() {
            try {
                over.remove();
            }
            catch (_) { }
            try {
                document.removeEventListener("keydown", onKey);
            }
            catch (_) { }
            if (closeBig === shut)
                closeBig = null;
        }
        cancel.addEventListener("click", shut);
        if (save && done)
            save.addEventListener("click", () => {
                const text = ta.value;
                shut();
                done(text);
            });
        // A tap on the dark part closes it, the way every sheet on a phone does.
        over.addEventListener("click", (e) => {
            if (e && e.target === over)
                shut();
        });
        document.addEventListener("keydown", onKey);
        document.body.appendChild(over);
        closeBig = shut;
        // The scheme and the readability sweep apply here too: this is a panel of
        // ours sitting on the page rather than inside the drawer.
        setScheme(box);
        try {
            requestAnimationFrame(() => sweepReadable(box));
        }
        catch (_) { }
    }
    disposers.push(() => {
        if (closeBig) {
            try {
                closeBig();
            }
            catch (_) { }
        }
    });
    let presets = [];
    let presetPick = "";
    let presetName = "";
    let presetSaid = null;
    // The two that ship with it, offered alongside your own. They are not stored
    // and cannot be renamed or deleted, so they are always there to go back to.
    function builtIn() {
        return BUILT_IN_PROMPTS.map((p) => ({
            name: p.name,
            at: 0,
            settings: { blocks: p.blocks.map((b) => ({ ...b })), thinkingMode: p.thinking },
        }));
    }
    const isBuiltIn = (name) => BUILT_IN.indexOf(name) >= 0;
    const allPresets = () => builtIn().concat(presets);
    function loadPresets() {
        try {
            if (typeof localStorage === "undefined")
                return;
            const raw = localStorage.getItem(PRESETS_KEY);
            const list = raw ? JSON.parse(raw) : [];
            if (Array.isArray(list))
                presets = list
                    .filter((x) => x && typeof x === "object" && x.name)
                    .slice(0, 60)
                    .map((x) => ({
                    name: String(x.name),
                    at: Number(x.at) || 0,
                    settings: x.settings && typeof x.settings === "object" ? x.settings : {},
                }));
        }
        catch (_) {
            presets = [];
        }
    }
    loadPresets();
    function savePresets() {
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
        }
        catch (_) { }
        // And up to the account, so a preset saved on a phone is there on a laptop.
        try {
            send({ type: "save_presets", presets: presets });
        }
        catch (_) { }
    }
    let setups = [];
    let setupPick = "";
    let setupName = "";
    let setupSaid = null;
    function cleanSetups(list) {
        return (Array.isArray(list) ? list : [])
            .filter((x) => x && typeof x === "object" && x.name)
            .slice(0, 40)
            .map((x) => ({
            name: String(x.name),
            at: Number(x.at) || 0,
            settings: x.settings && typeof x.settings === "object" ? x.settings : {},
        }));
    }
    function loadSetups() {
        try {
            if (typeof localStorage === "undefined")
                return;
            const raw = localStorage.getItem(SETUPS_KEY);
            setups = cleanSetups(raw ? JSON.parse(raw) : []);
        }
        catch (_) {
            setups = [];
        }
    }
    loadSetups();
    function saveSetups() {
        try {
            if (typeof localStorage !== "undefined")
                localStorage.setItem(SETUPS_KEY, JSON.stringify(setups));
        }
        catch (_) { }
        try {
            send({ type: "save_setups", setups: setups });
        }
        catch (_) { }
    }
    let setupAsk = "";
    function loadSetupsFromAccount() {
        setupAsk = "arf-setups-" + newId();
        send({ type: "load_setups", requestId: setupAsk });
    }
    function tookAccountSetups(msg) {
        if (!msg || msg.requestId !== setupAsk)
            return;
        setupAsk = "";
        const clean = Array.isArray(msg.setups) ? cleanSetups(msg.setups) : [];
        if (clean.length) {
            setups = clean;
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(SETUPS_KEY, JSON.stringify(setups));
            }
            catch (_) { }
            log("brought " + clean.length + (clean.length === 1 ? " model setup" : " model setups") + " down from your account", true);
            paint();
        }
        else if (setups.length) {
            saveSetups();
            log("sent " + setups.length + (setups.length === 1 ? " model setup" : " model setups") + " up to your account", true);
        }
    }
    // What the Model tab says right now, copied rather than referenced so that
    // changing a sampler afterwards does not quietly edit the setup it came from.
    function setupFromNow() {
        const out = {};
        for (const k of SETUP_KEYS)
            out[k] = k === "samplers" ? Object.assign({}, cfg.samplers || {}) : cfg[k];
        return out;
    }
    // A setup, put on. Every value is checked on the way in the same way the
    // fields themselves check it, so a hand-edited or out-of-date one cannot put
    // the panel into a state its own controls could not reach.
    function applySetup(one) {
        let took = 0;
        for (const k of SETUP_KEYS) {
            if (!(k in one.settings))
                continue;
            const got = one.settings[k];
            if (k === "samplers") {
                if (!got || typeof got !== "object" || Array.isArray(got))
                    continue;
                const clean = {};
                for (const f of SAMPLER_FIELDS) {
                    const v = Number(got[f.id]);
                    if (got[f.id] === "" || got[f.id] == null || !Number.isFinite(v))
                        continue;
                    clean[f.id] = Math.min(f.max, Math.max(f.min, v));
                }
                cfg.samplers = clean;
                took++;
            }
            else if (k === "timeoutSecs") {
                const v = Number(got);
                if (!Number.isFinite(v))
                    continue;
                cfg.timeoutSecs = Math.min(3600, Math.max(0, Math.round(v)));
                took++;
            }
            else if (typeof got === "string") {
                // A pick can only be given something it offers. A connection is the
                // exception: the list is the account's, not this file's, and a setup
                // saved before a connection was deleted still names it. That is said on
                // the card rather than silently corrected, since the alternative is
                // quietly refining with the wrong model.
                const field = COST_FIELDS.find((f) => f.key === k);
                const opts = field && field.options;
                if (k !== "connectionId" && opts && !opts.some((o) => o.value === got))
                    continue;
                cfg[k] = got;
                took++;
            }
        }
        if (took)
            persist(true);
        return took;
    }
    // Whether the connection the settings are pointed at is one the account still
    // has. Not asked before the list has arrived, since not knowing yet and
    // knowing it is gone are different things to say.
    function lostConnection() {
        const id = String(cfg.connectionId || "");
        if (!id || !connections.length)
            return false;
        return !connections.some((c) => c.id === id);
    }
    // Whether a saved setup names a connection this account no longer has.
    function setupLost(one) {
        const id = String(one.settings.connectionId || "");
        if (!id)
            return false;
        if (!connections.length)
            return false;
        return !connections.some((c) => c.id === id);
    }
    // The account's presets on load. The account wins when it has any; when it
    // has none and this browser does, this browser's go up. Same rule the
    // settings use, so the two cannot disagree about which copy is the real one.
    let presetAsk = "";
    function loadPresetsFromAccount() {
        presetAsk = "arf-presets-" + newId();
        send({ type: "load_presets", requestId: presetAsk });
    }
    function tookAccountPresets(msg) {
        if (!msg || msg.requestId !== presetAsk)
            return;
        presetAsk = "";
        const list = Array.isArray(msg.presets) ? msg.presets : null;
        const clean = list
            ? list
                .filter((x) => x && typeof x === "object" && x.name)
                .slice(0, 60)
                .map((x) => ({
                name: String(x.name),
                at: Number(x.at) || 0,
                settings: x.settings && typeof x.settings === "object" ? x.settings : {},
            }))
            : [];
        if (clean.length) {
            presets = clean;
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
            }
            catch (_) { }
            log("brought " + clean.length + (clean.length === 1 ? " preset" : " presets") + " down from your account", true);
            paint();
        }
        else if (presets.length) {
            savePresets();
            log("sent " + presets.length + (presets.length === 1 ? " preset" : " presets") + " up to your account", true);
        }
    }
    // Only the keys a preset owns, and each one copied rather than referenced, or
    // editing your rules would quietly edit the preset you saved them from.
    function presetFromNow() {
        const out = {};
        for (const k of PRESET_KEYS) {
            if (k === "blocks")
                out.blocks = blockList("blocks").map((b) => ({ ...b }));
            else if (k === "userBlocks")
                out.userBlocks = blockList("userBlocks").map((b) => ({ ...b }));
            else if (k === "samplers")
                out.samplers = Object.assign({}, cfg.samplers || {});
            else
                out[k] = cfg[k];
        }
        return out;
    }
    function applyPreset(p) {
        let took = 0;
        for (const k of PRESET_KEYS) {
            if (!(k in p.settings))
                continue;
            const got = p.settings[k];
            if (k === "blocks" || k === "userBlocks") {
                if (!Array.isArray(got))
                    continue;
                cfg[k] = got
                    .filter((b) => b && typeof b === "object" && b.id)
                    .slice(0, 40)
                    .map((b) => ({
                    id: String(b.id),
                    on: b.on !== false,
                    role: ROLE_OPTIONS.some((r) => r.value === String(b.role)) ? String(b.role) : "system",
                    text: b.text == null ? "" : String(b.text),
                    name: b.name == null ? "" : String(b.name),
                }));
                took++;
            }
            else if (k === "samplers") {
                if (!got || typeof got !== "object" || Array.isArray(got))
                    continue;
                const clean = {};
                for (const f of SAMPLER_FIELDS) {
                    const v = Number(got[f.id]);
                    if (got[f.id] === "" || got[f.id] == null || !Number.isFinite(v))
                        continue;
                    clean[f.id] = Math.min(f.max, Math.max(f.min, v));
                }
                cfg.samplers = clean;
                took++;
            }
            else if (k === "contextMessages") {
                const v = Number(got);
                if (Number.isFinite(v)) {
                    cfg.contextMessages = Math.min(40, Math.max(0, Math.round(v)));
                    took++;
                }
            }
            else if (typeof got === "string") {
                cfg[k] = got;
                took++;
            }
        }
        if (took)
            persist(true);
        return took;
    }
    function buildPresetCard() {
        const wrap = card("Presets", "Four prompts ship with the extension and work as they stand: a short one and a detailed one, each in a version for a plain model and a version for a model that reasons. Saving your own keeps your prompt, your run-up count and your samplers under a name. Everything else stays as you have it, whichever you load. A connection is not saved, since an id from another account names nothing here.", presets.length ? presets.length + " yours" : BUILT_IN.length + " built in");
        const sel = document.createElement("select");
        sel.className = "arf-field";
        sel.setAttribute("aria-label", "Saved presets");
        sel.setAttribute("data-arf-field", "presetPick");
        const none = document.createElement("option");
        none.value = "";
        none.textContent = "Pick a preset";
        sel.appendChild(none);
        for (const p of allPresets()) {
            const op = document.createElement("option");
            op.value = p.name;
            op.textContent = p.name;
            sel.appendChild(op);
        }
        sel.value = presetPick;
        sel.addEventListener("change", () => {
            presetPick = sel.value;
            presetName = sel.value;
            presetSaid = null;
            paint();
        });
        wrap.appendChild(sel);
        const nameIn = document.createElement("input");
        nameIn.type = "text";
        nameIn.className = "arf-field";
        nameIn.placeholder = "A name for this setup";
        nameIn.value = presetName;
        nameIn.setAttribute("aria-label", "Preset name");
        nameIn.setAttribute("data-arf-field", "presetName");
        nameIn.addEventListener("input", () => {
            presetName = nameIn.value;
        });
        wrap.appendChild(nameIn);
        const chosen = () => allPresets().find((p) => p.name === presetPick) || null;
        const chosenIsYours = () => !!presetPick && !isBuiltIn(presetPick);
        const row = el("div", "arf-row");
        const load = button("Load", false);
        load.setAttribute("data-arf-preset", "load");
        load.disabled = !chosen();
        load.style.opacity = load.disabled ? "0.45" : "1";
        load.addEventListener("click", () => {
            const p = chosen();
            if (!p)
                return;
            const took = applyPreset(p);
            presetSaid = took
                ? "Loaded " + p.name + "."
                : "There was nothing in that preset to load.";
            log("loaded the preset " + p.name, true);
            paint();
        });
        const asNew = button("Save as new", false);
        asNew.setAttribute("data-arf-preset", "new");
        asNew.addEventListener("click", () => {
            const name = String(presetName || "").trim();
            if (!name) {
                presetSaid = "Give it a name first.";
                paint();
                return;
            }
            if (isBuiltIn(name)) {
                presetSaid = "That is the name of one of the two that ship with the extension. Pick another.";
                paint();
                return;
            }
            if (presets.some((p) => p.name === name)) {
                presetSaid = "There is already a preset called that. Use Update selected, or pick another name.";
                paint();
                return;
            }
            presets.push({ name: name, at: Date.now(), settings: presetFromNow() });
            presets = presets.slice(-60);
            savePresets();
            presetPick = name;
            presetSaid = "Saved " + name + ".";
            paint();
        });
        const update = button("Update selected", false);
        update.setAttribute("data-arf-preset", "update");
        update.disabled = !chosenIsYours();
        update.style.opacity = update.disabled ? "0.45" : "1";
        update.addEventListener("click", () => {
            const p = chosen();
            if (!p || isBuiltIn(p.name))
                return;
            p.settings = presetFromNow();
            p.at = Date.now();
            savePresets();
            presetSaid = "Updated " + p.name + ".";
            paint();
        });
        const rename = button("Rename selected", false);
        rename.setAttribute("data-arf-preset", "rename");
        rename.disabled = !chosenIsYours();
        rename.style.opacity = rename.disabled ? "0.45" : "1";
        rename.addEventListener("click", () => {
            const p = chosen();
            const name = String(presetName || "").trim();
            if (!p || isBuiltIn(p.name))
                return;
            if (!name) {
                presetSaid = "Put the new name in the box first.";
                paint();
                return;
            }
            if (name !== p.name && (isBuiltIn(name) || presets.some((x) => x.name === name))) {
                presetSaid = "There is already a preset called that.";
                paint();
                return;
            }
            p.name = name;
            savePresets();
            presetPick = name;
            presetSaid = "Renamed.";
            paint();
        });
        const drop = button("Delete", false);
        drop.className += " arf-danger";
        drop.setAttribute("data-arf-preset", "delete");
        drop.disabled = !chosenIsYours();
        drop.style.opacity = drop.disabled ? "0.45" : "1";
        drop.addEventListener("click", () => {
            const p = chosen();
            if (!p || isBuiltIn(p.name))
                return;
            presets = presets.filter((x) => x !== p);
            savePresets();
            presetPick = "";
            presetName = "";
            presetSaid = "Deleted " + p.name + ".";
            paint();
        });
        row.appendChild(load);
        row.appendChild(asNew);
        row.appendChild(update);
        row.appendChild(rename);
        row.appendChild(drop);
        wrap.appendChild(row);
        if (presetPick && isBuiltIn(presetPick)) {
            const which = BUILT_IN_PROMPTS.find((p) => p.name === presetPick);
            if (which)
                wrap.appendChild(note(which.what));
            wrap.appendChild(note("One of the ones that ship with the extension. Load it, change it however you like, then save it under a name of your own."));
        }
        if (presetSaid)
            wrap.appendChild(note(presetSaid));
        return wrap;
    }
    // ---- putting everything back ----
    function buildResetInto(wrap) {
        wrap.appendChild(el("div", "arf-rule"));
        const head = el("div", "arf-row");
        head.appendChild(el("span", "arf-sign arf-bad-ink", "!"));
        head.appendChild(el("span", "arf-lab arf-grow", "Start again"));
        wrap.appendChild(head);
        wrap.appendChild(bad("This cannot be undone. If your prompt is among the parts below, every block you wrote and every rule in them is gone. Export first if there is any chance you want it back."));
        const chosen = transferParts().filter((p) => partOn("resetParts", p.id));
        const row = el("div", "arf-row");
        const go = button(chosen.length === transferParts().length ? "Reset everything" : "Reset the " + chosen.length + " chosen", false);
        go.className += " arf-danger";
        go.setAttribute("data-arf-reset", "1");
        go.disabled = !chosen.length;
        go.style.opacity = chosen.length ? "1" : "0.45";
        go.addEventListener("click", () => resetAll());
        row.appendChild(go);
        wrap.appendChild(row);
        if (resetSaid)
            wrap.appendChild(resetArmed ? bad(resetSaid) : note(resetSaid));
        wrap.appendChild(fold("What to put back", (body) => {
            body.appendChild(note("Only what is switched on here is reset. Everything else is left exactly as it is, so you can start your prompt again without losing your connection, your limits and your presets."));
            body.appendChild(partsPicker("resetParts", transferParts()));
        }));
    }
    let resetSaid = null;
    async function resetAll() {
        const chosen = transferParts().filter((p) => partOn("resetParts", p.id));
        if (!chosen.length)
            return;
        // A confirmation, because this is the one control here that throws work
        // away. Everything else on the panel is a switch or a box you can put back.
        const names = chosen.map((p) => p.label.toLowerCase()).join(", ");
        const title = "Reset " + (chosen.length === transferParts().length ? "everything" : "these?");
        const message = "This puts back the defaults for: " +
            names +
            ". There is no undo, and your prompt is not recoverable unless you exported it.";
        let yes = false;
        let asked = false;
        try {
            if (ctx.ui && typeof ctx.ui.showConfirm === "function") {
                const answer = await ctx.ui.showConfirm({
                    title: title,
                    message: message,
                    variant: "danger",
                    confirmLabel: "Reset",
                });
                asked = true;
                yes = !!(answer && answer.confirmed);
            }
        }
        catch (_) {
            asked = false;
        }
        if (!asked) {
            // A host with no confirm dialog, or one that refused. Ask in the panel
            // rather than resetting on a single tap, which is the outcome this whole
            // branch exists to prevent.
            if (!resetArmed) {
                resetArmed = true;
                resetSaid =
                    "Press it again to confirm. Everything goes back to its default and there is no undo.";
                paint();
                setTimeout(() => {
                    if (!resetArmed)
                        return;
                    resetArmed = false;
                    resetSaid = null;
                    paint();
                }, 8000);
                return;
            }
            yes = true;
        }
        if (!yes) {
            resetArmed = false;
            return;
        }
        resetArmed = false;
        // Only the keys the chosen parts cover. Which tab you were looking at is
        // never among them: putting that back would throw you off the page you
        // pressed the button on, which reads as the panel breaking.
        for (const k of keysFor("resetParts"))
            cfg[k] = CONFIG[k];
        if (partOn("resetParts", PART_PRESETS)) {
            presets = [];
            presetPick = "";
            presetName = "";
            savePresets();
        }
        if (partOn("resetParts", PART_SETUPS)) {
            setups = [];
            setupPick = "";
            setupName = "";
            saveSetups();
        }
        if (partOn("resetParts", PART_CHATS)) {
            chatsOff = [];
            saveChatsOff();
        }
        preview = null;
        persist(true);
        syncExtras();
        resetSaid =
            "Put back: " + chosen.map((p) => p.label.toLowerCase()).join(", ") + ".";
        log("reset " + chosen.length + " part" + (chosen.length === 1 ? "" : "s"), true);
        paint();
    }
    let resetArmed = false;
    // ---- the sound ----
    // A short two-note blip when nothing else is chosen, synthesised rather than
    // shipped so the repository holds no audio file and the switch still makes a
    // sound on its own. A file you attach or a link you paste replaces it.
    const hasSound = () => !!String(cfg.soundUrl || "").trim();
    function beep(vol) {
        try {
            const g = globalThis;
            const Ctx = g.AudioContext || g.webkitAudioContext;
            if (!Ctx)
                return;
            const ac = new Ctx();
            const at = ac.currentTime;
            const gain = ac.createGain();
            gain.connect(ac.destination);
            // Ramped rather than switched, or it clicks going in and out.
            gain.gain.setValueAtTime(0.0001, at);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol * 0.2), at + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
            const play = (freq, from, len) => {
                const osc = ac.createOscillator();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, at + from);
                osc.connect(gain);
                osc.start(at + from);
                osc.stop(at + from + len);
            };
            play(660, 0, 0.11);
            play(880, 0.11, 0.18);
            setTimeout(() => {
                try {
                    ac.close();
                }
                catch (_) { }
            }, 900);
        }
        catch (_) { }
    }
    function ping(force) {
        if (!cfg.soundOn && !force)
            return;
        const vol = Math.min(1, Math.max(0, Number(cfg.soundVolume) / 100));
        const url = String(cfg.soundUrl || "").trim();
        if (!url) {
            beep(Number.isFinite(vol) ? vol : 0.6);
            return;
        }
        try {
            const a = new globalThis.Audio(url);
            a.volume = Number.isFinite(vol) ? vol : 0.6;
            a.addEventListener("error", () => {
                // A link that does not load. Worth saying, and worth still making a
                // sound: the point of the switch is to hear something.
                soundSaid = "That sound could not be played, so the built-in one was used instead.";
                beep(Number.isFinite(vol) ? vol : 0.6);
                if (force)
                    paint();
            });
            const p = a.play();
            // A browser that has not seen a gesture on this page refuses to play.
            // That is a refusal rather than a fault, so it is only reported when you
            // pressed Play yourself and are waiting to hear something.
            if (p && typeof p.catch === "function")
                p.catch((e) => {
                    if (!force)
                        return;
                    soundSaid =
                        e && e.name === "NotAllowedError"
                            ? "The browser blocked it. Interact with the page once, then try again."
                            : "That sound could not be played.";
                    paint();
                });
            else if (!p)
                beep(Number.isFinite(vol) ? vol : 0.6);
        }
        catch (_) {
            if (force) {
                soundSaid = "That sound could not be played.";
                paint();
            }
        }
    }
    // ---- refining what you are typing ----
    // The one part of this extension that reaches into the page. Everything else
    // goes through the host's own APIs; there is no API for the input box, so
    // this finds it, and this is what breaks if Lumiverse ever moves it.
    // Tried in order, most specific first, and every one of them describes the
    // box Lumiverse actually renders: a textarea named chat-message inside the
    // input area. The container and the name are two independent facts, so a
    // build that changes one is still found by the entry that leans on the other.
    //
    // The bare textarea at the end is the last resort and is meant to be one: it
    // takes the last textarea on the page, which is right only because the chat
    // input sits below everything it could be confused with. Anything above it
    // has to be a shape somebody has actually seen. Three entries here named a
    // ChatInput and an InputBar component, and no such component exists; they
    // matched nothing but the stub written to match them.
    const INPUT_PICKS = [
        '[data-component="InputArea"] textarea[name="chat-message"]',
        'textarea[name="chat-message"]',
        '[data-component="InputArea"] textarea',
        "textarea",
    ];
    function composer() {
        try {
            for (const pick of INPUT_PICKS) {
                const found = document.querySelectorAll(pick);
                // The last one on the page, since a panel of ours is also a textarea
                // and the chat input is below everything it could be confused with.
                for (let i = found.length - 1; i >= 0; i--) {
                    const node = found[i];
                    if (!node || node.disabled || node.readOnly)
                        continue;
                    // Never our own panel, whichever selector found it.
                    if (node.closest && node.closest(".arf"))
                        continue;
                    const box = node.getBoundingClientRect ? node.getBoundingClientRect() : null;
                    if (box && (!box.width || !box.height))
                        continue;
                    return node;
                }
            }
        }
        catch (_) { }
        return null;
    }
    // Written through the native setter, then announced as an input event. A
    // plain assignment sets the DOM value and leaves the framework holding the
    // old one, so the box shows the new text and sends the old.
    function setComposer(node, text) {
        try {
            const proto = Object.getPrototypeOf(node);
            const desc = Object.getOwnPropertyDescriptor(proto, "value");
            if (desc && desc.set)
                desc.set.call(node, text);
            else
                node.value = text;
            node.dispatchEvent(new Event("input", { bubbles: true }));
            return true;
        }
        catch (_) {
            return false;
        }
    }
    let inputWaiting = null;
    let inputNode = null;
    // The draft as it stood before the refine, so the card can put it back. It is
    // held here and nowhere else: a draft is not a saved message, so the backend
    // has no copy of it and there is nothing to ask for.
    let inputBefore = "";
    function refineInput() {
        const node = composer();
        if (!node) {
            toast("Could not find the input box on this page.", true);
            log("could not find the input box");
            return;
        }
        const text = String(node.value || "").trim();
        if (!text) {
            toast("There is nothing in the input box to refine.", true);
            return;
        }
        if (noTurn()) {
            toast("Your prompt has no {{message}} block, so there is nothing to rewrite.", true);
            return;
        }
        // One at a time, the same rule the reply button follows. Not only because
        // two model calls at once is not what anybody asked for: everything on
        // screen that says a refine is running is one state, and a second refine
        // ending would clear it out from under the first while that one was still
        // going, taking the live line, the countdown and both watchdogs with it.
        if (busy) {
            toast("A refine is already running. Wait for it, or stop it first.", true);
            return;
        }
        if (inputWaiting)
            return;
        inputNode = node;
        inputBefore = text;
        const id = newId();
        inputWaiting = id;
        log("refining what you are typing");
        // The same path the Try it box uses: nothing is saved to the chat, the
        // answer comes back and this puts it in the box. asUser is what tells the
        // model it is looking at your own hand rather than the story's voice.
        send({ type: "try_refine", requestId: id, text: text, asUser: true });
        // Running, from this moment, rather than from whenever the backend's first
        // progress message happens to land. Everything that shows a refine in
        // flight reads this: the status line, the clock, and the widget, which is
        // often the only part of the extension on screen. Setting it here rather
        // than there is the difference between the widget turning while the model
        // is working and it starting to turn as the answer arrives.
        markBusy(true, "asking");
        paint();
    }
    // ---- the floating button and the input bar row ----
    let widget = null;
    // Runs the listeners off the last button that was built. Null when there is
    // none to take down.
    let widgetOff = null;
    function dropWidget() {
        // The listeners first: destroy can throw, and a button that is gone with
        // its listeners still on the window is the shape of the leak this avoids.
        try {
            widgetOff && widgetOff();
        }
        catch (_) { }
        widgetOff = null;
        try {
            widget && widget.destroy && widget.destroy();
        }
        catch (_) { }
        widget = null;
        floatBtn = null;
    }
    function raiseWidget() {
        if (widget)
            return;
        try {
            // Square, and the button fills it. It came out as a squashed oval
            // because the host sizes the container and the button inside was drawing
            // its own 50% radius against whatever shape that turned out to be.
            const d = widgetWanted();
            widget = ctx.ui.createFloatWidget({
                width: d,
                height: d,
                initialPosition: { x: 16, y: 160 },
                snapToEdge: true,
                tooltip: "Auto Refine",
                chromeless: true,
            });
        }
        catch (_) {
            // ui_panels is not granted. The extension is fine without it; the button
            // is the only thing missing, and the panel says so rather than the
            // switch silently doing nothing.
            widget = null;
            widgetFailed = true;
            log("could not create the floating button. Check that the ui_panels permission is granted.");
            return;
        }
        widgetFailed = false;
        widgetAt = widgetWanted();
        try {
            // The host's container is whatever shape it is, so this squares itself
            // rather than trusting it, and the icon is centred in a fixed box.
            const root = widget.root;
            root.style.cssText = "width:100%;height:100%;display:flex;align-items:center;justify-content:center";
            const b = document.createElement("button");
            b.type = "button";
            b.className = "arf-float";
            b.setAttribute("aria-label", "Auto Refine");
            b.innerHTML = refineIcon();
            paintFloat(b);
            // One tap does the main thing. A press and hold, or a right click, opens
            // the menu.
            //
            // The disarm listens on the window, in the capture phase, and a drag of
            // more than a few pixels cancels it too. Waiting for the button's own
            // pointerup does not work: the host captures the pointer to drag the
            // widget, so that pointerup never arrives, every tap becomes a hold, and
            // the click behind it is swallowed by a flag nothing clears.
            let held = null;
            let downAt = null;
            let menuOpened = false;
            const disarm = () => {
                if (held)
                    clearTimeout(held);
                held = null;
                downAt = null;
            };
            const onMove = (e) => {
                if (!downAt || !held)
                    return;
                const dx = Math.abs((e.clientX || 0) - downAt.x);
                const dy = Math.abs((e.clientY || 0) - downAt.y);
                // Moved: this is the host dragging the widget, not a hold.
                if (dx > 6 || dy > 6)
                    disarm();
            };
            // Capture phase and on the window, so a pointer the host has captured
            // still gets here.
            const onUp = () => disarm();
            try {
                globalThis.addEventListener("pointerup", onUp, true);
                globalThis.addEventListener("pointercancel", onUp, true);
                globalThis.addEventListener("pointermove", onMove, true);
                // Held against this button rather than the session. It is rebuilt every
                // time its size changes and every time it is switched off and on, and
                // dropping these only at teardown would leave three more window
                // listeners per rebuild, each holding a button that is off screen, all
                // of them running on every pointermove across the page.
                widgetOff = () => {
                    try {
                        globalThis.removeEventListener("pointerup", onUp, true);
                        globalThis.removeEventListener("pointercancel", onUp, true);
                        globalThis.removeEventListener("pointermove", onMove, true);
                    }
                    catch (_) { }
                    disarm();
                };
            }
            catch (_) { }
            b.addEventListener("pointerdown", (e) => {
                menuOpened = false;
                downAt = { x: (e && e.clientX) || 0, y: (e && e.clientY) || 0 };
                if (held)
                    clearTimeout(held);
                held = setTimeout(() => {
                    held = null;
                    menuOpened = true;
                    widgetMenu();
                }, 550);
            });
            b.addEventListener("click", (e) => {
                disarm();
                // Only suppressed when the menu actually opened, rather than by a flag
                // that could be left set.
                if (menuOpened) {
                    menuOpened = false;
                    return;
                }
                try {
                    e.preventDefault();
                    e.stopPropagation();
                }
                catch (_) { }
                widgetTap();
            });
            b.addEventListener("contextmenu", (e) => {
                try {
                    e.preventDefault();
                }
                catch (_) { }
                disarm();
                menuOpened = true;
                widgetMenu();
            });
            root.appendChild(b);
            floatBtn = b;
        }
        catch (_) { }
    }
    let floatBtn = null;
    let widgetAt = 0;
    const widgetWanted = () => Math.min(96, Math.max(28, Math.round(Number(cfg.widgetSize) || 44)));
    const widgetUp = () => !!widget && !!floatBtn;
    // Whether the floating button can actually take over the entries that hide
    // for it. Its menu is Lumiverse's, not ours: a host without showContextMenu
    // has no menu to put them in, and an entry that hid for a button with nowhere
    // to hold it would simply be gone.
    // Where the host should draw the menu: under the middle of the button.
    // Null when the button cannot be measured, and the host then places it
    // itself rather than being handed a wrong position.
    function anchorOf() {
        try {
            if (!floatBtn || typeof floatBtn.getBoundingClientRect !== "function")
                return null;
            const r = floatBtn.getBoundingClientRect();
            if (!r || (!r.width && !r.height))
                return null;
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.bottom) };
        }
        catch (_) {
            return null;
        }
    }
    const widgetCarriesEntries = () => {
        try {
            return widgetUp() && typeof ctx?.ui?.showContextMenu === "function";
        }
        catch (_) {
            return false;
        }
    };
    // What one tap does: put the last refine back when there is one and you asked
    // for that, otherwise refine.
    function widgetTap() {
        // A refine is running, so the tap stops it. The button is showing a
        // spinner, and tapping the spinner to call it off is the thing anybody
        // tries first. Starting a second refine on top of the first is not.
        if (busy) {
            cancelRefine();
            return;
        }
        // A refine is holding for an answer. The tap opens the tab where both
        // versions are, since accepting a rewrite of somebody's writing on a stray
        // tap is the one thing this button must never do.
        if (pending) {
            try {
                tab && tab.activate && tab.activate();
            }
            catch (_) { }
            toast("A refine is waiting for you in the Auto Refine tab.", true);
            return;
        }
        if (cfg.widgetUndo) {
            const back = newestBack();
            if (back) {
                if (back.kind === "draft")
                    putDraftBack();
                else
                    askUndo(back.one.chatId, back.one.messageId);
                return;
            }
        }
        refineNow();
    }
    // What the floating button shows, which is the same three states the message
    // button has: working, something to put back, or ready.
    function paintFloat(b) {
        const el2 = b || floatBtn;
        if (!el2)
            return;
        try {
            const back = cfg.widgetUndo && !!newestBack();
            const working = busy;
            // Why a tap would do nothing, when that is the answer. On the home screen
            // there is no chat to refine, and the button was still drawn ready for
            // one: the tap explained itself in a toast, but only after you had
            // pressed a button that looked willing.
            const stuck = working || back ? "" : whyNot();
            // The icons are written at a fixed 20px, which is most of a 28px button
            // and lost inside a 96px one. Just over half the button leaves the ring
            // around it looking even at either end of the range.
            const mark = String(Math.round(widgetWanted() * 0.52));
            const kind = (working ? "working" : back ? "back" : "ready") + ":" + mark;
            // Only when it would draw something different.
            //
            // This runs from the clock, which is to say two and a half times a
            // second while a refine is in flight, and rewriting the icon throws the
            // old one away mid-turn. The ring is turned by the stylesheet over 900ms,
            // so it never got past half a rotation before starting again from the
            // top: a spinner that stutters rather than turns. The message buttons
            // have had this guard for a while and spin smoothly; the widget did not.
            if (el2.getAttribute("data-arf-icon") !== kind) {
                el2.setAttribute("data-arf-icon", kind);
                el2.innerHTML = working ? spinIcon() : back ? undoIcon() : refineIcon();
                const svg = el2.querySelector && el2.querySelector("svg");
                if (svg) {
                    svg.setAttribute("width", mark);
                    svg.setAttribute("height", mark);
                }
            }
            el2.className =
                "arf-float" +
                    (working ? " arf-working" : "") +
                    (back ? " arf-back" : "") +
                    (stuck ? " arf-idle" : "");
            el2.title = working
                ? "Refining. Tap to stop it."
                : back
                    ? "Put the last refine back. Hold for more."
                    : stuck
                        ? stuck + " Hold for more."
                        : "Refine the latest reply. Hold for more.";
            el2.setAttribute("aria-label", el2.title);
        }
        catch (_) { }
    }
    // One menu at a time. Android raises contextmenu on a long press as well as
    // running the hold timer, so this is asked for twice on the way to one
    // gesture. The host's menu cannot be taken down and rebuilt, so the second
    // ask is dropped rather than stacked on the first.
    let menuToken = null;
    // Held, or right clicked. Everything the button could do that one tap cannot,
    // drawn by Lumiverse rather than by us: a menu of ours over the chat would be
    // a second menu style on the same screen, and would have to guess at what a
    // pointer meant on a phone.
    async function widgetMenu() {
        const menu = ctx && ctx.ui && ctx.ui.showContextMenu;
        if (typeof menu !== "function") {
            // A Lumiverse without the API. Say where everything is rather than
            // opening nothing and looking broken. The Extras row is still registered
            // in this case, because widgetCarriesEntries answers no.
            log("this version of Lumiverse cannot open the button's menu");
            toast("Everything is in the Auto Refine tab in the drawer.", true);
            return;
        }
        if (menuToken)
            return;
        const groups = [];
        // A refine holding for an answer comes before everything, because nothing
        // else is going to happen until it is settled.
        if (pending)
            groups.push([
                { key: "accept", label: "Accept the refine that is waiting" },
                { key: "decline", label: "Turn it down and keep the reply" },
            ]);
        // The panel. It is what somebody holding the button is most likely after,
        // and everything taken out of this list is in it.
        groups.push([{ key: "open", label: "Open the Auto Refine tab" }]);
        const doing = [];
        // While it is running, stopping it is the only thing anybody opens this
        // menu for, and starting another is not offered at all.
        if (busy)
            doing.push({ key: "stop", label: "Stop this refine" });
        else {
            doing.push({ key: "now", label: "Refine the latest reply" });
            doing.push({ key: "all", label: "Refine every reply in this chat" });
        }
        // Unless the button itself is the undo, which is what widgetUndo makes it.
        // Then the arrow is in front of you and the entry underneath it does the
        // same thing twice.
        if (!cfg.widgetUndo) {
            const back = newestBack();
            if (back)
                doing.push({
                    key: "undo",
                    label: back.kind === "draft" ? "Put your draft back" : "Put the last refine back",
                });
        }
        // On the same terms as the Extras rows: their setting puts them there, and
        // this menu takes them over while the button is on screen.
        if (cfg.inputRefine)
            doing.push({ key: "draft", label: "Refine what I am typing" });
        groups.push(doing);
        // Last, under everything else, because these two are the only entries that
        // take the button off the screen.
        groups.push([
            { key: "hide", label: "Hide this button" },
            { key: "off", label: "Turn Auto Refine off" },
        ]);
        // A line between one group and the next, and never above the first or below
        // the last: a menu that opens on a rule looks like it lost an entry.
        const items = [];
        for (const group of groups) {
            if (!group.length)
                continue;
            if (items.length)
                items.push({ key: "line" + items.length, label: "", type: "divider" });
            for (const one of group)
                items.push(one);
        }
        const token = {};
        menuToken = token;
        let picked = null;
        try {
            // Anchored to the button. A hold means the finger is already over it, and
            // the menu is also reachable by right click, so the button is the one
            // place that is right for both.
            const at = anchorOf();
            const got = await menu.call(ctx.ui, at ? { position: at, items: items } : { items: items });
            picked = got && got.selectedKey ? String(got.selectedKey) : null;
        }
        catch (e) {
            log("the button's menu could not be opened: " + ((e && e.message) || String(e)));
        }
        finally {
            if (menuToken === token)
                menuToken = null;
        }
        if (!picked)
            return;
        if (picked === "hide") {
            cfg.widgetOn = false;
            persist(true);
            toast("The floating button is hidden. Switch it back on under Setup.", true);
            paint();
            return;
        }
        if (picked === "accept")
            takePending(true);
        else if (picked === "decline")
            takePending(false);
        else if (picked === "stop")
            cancelRefine();
        else if (picked === "now")
            refineNow();
        else if (picked === "all")
            startSweep();
        else if (picked === "undo") {
            const back = newestBack();
            if (back && back.kind === "draft")
                putDraftBack();
            else if (back)
                askUndo(back.one.chatId, back.one.messageId);
        }
        else if (picked === "draft")
            refineInput();
        else if (picked === "open") {
            try {
                tab && tab.activate && tab.activate();
            }
            catch (_) { }
        }
        else if (picked === "off") {
            cfg.enabled = false;
            persist(true);
            paint();
        }
    }
    function syncExtras() {
        // The floating button. Rebuilt when the size changes: the host sizes the
        // container when it is made and there is no asking it to resize.
        if (widget && widgetWanted() !== widgetAt)
            dropWidget();
        if (cfg.widgetOn && cfg.enabled)
            raiseWidget();
        else
            dropWidget();
        // The button is settled before the Extras row is decided, because that
        // decision is "is there a button to hold this instead".
        // The Extras row.
        //
        // In one place at a time. While the floating button is on screen its menu
        // holds these, and Extras holds them only when there is no button to. Two
        // ways to reach one thing is one more than anybody needs, and it clutters a
        // menu that was opened for something else. With the button off, or refused
        // because ui_panels was not granted, Extras is the only way to reach them
        // on a phone, so they come back.
        //
        // Refining the latest reply rides along with the row rather than arriving
        // on its own. The row on a message holds only the way back now, so somebody
        // without the floating button needs this to be somewhere, and it is not
        // worth a second switch: anybody who has asked for a row in Extras has
        // asked for the row, not for one particular entry in it. Nothing appears on
        // a fresh install either way, which is the rule this extension keeps: it
        // does not redecorate a screen because it was installed.
        const inExtras = !!cfg.enabled && !!cfg.inputRefine && !widgetCarriesEntries();
        extra("auto-refine-now", "Refine the latest reply", inExtras, () => refineNow());
        extra("auto-refine-input", "Refine what I am typing", inExtras, () => refineInput());
    }
    // One Extras entry, put up or taken down to match. Registered by id, so the
    // host is never handed two of the same one.
    const extras = new Map();
    function extra(id, label, want, run) {
        const had = extras.get(id);
        if (want && !had) {
            try {
                if (ctx.ui && typeof ctx.ui.registerInputBarAction === "function") {
                    const made = ctx.ui.registerInputBarAction({ id: id, label: label, iconSvg: refineIcon() });
                    if (made && typeof made.onClick === "function")
                        made.onClick(run);
                    extras.set(id, made);
                }
            }
            catch (_) {
                extras.delete(id);
            }
        }
        else if (!want && had) {
            try {
                had.destroy && had.destroy();
            }
            catch (_) { }
            extras.delete(id);
        }
    }
    disposers.push(() => {
        dropWidget();
        extras.forEach((one) => {
            try {
                one && one.destroy && one.destroy();
            }
            catch (_) { }
        });
        extras.clear();
    });
    function lastRenderedReply() {
        try {
            if (typeof document === "undefined")
                return "";
            const all = document.querySelectorAll('[data-component="MessageContent"]');
            for (let i = all.length - 1; i >= 0; i--) {
                const t = String(all[i].innerText || all[i].textContent || "").trim();
                if (t)
                    return t;
            }
        }
        catch (_) { }
        return "";
    }
    // Calls off whatever is running. Safe to press when nothing is: the backend
    // answers with how many it stopped, and the panel says so either way.
    //
    // A sweep counts as running even between two messages, where nothing is in
    // flight and busy is false. Without that, Stop on a sweep did nothing at the
    // one moment it was most likely to be pressed.
    function cancelRefine() {
        if (!busy && !sweep)
            return;
        send({ type: "cancel_refine", requestId: newId() });
        log("asked it to stop");
    }
    const stopRefine = cancelRefine;
    // ---- every reply in the chat ----
    // What a sweep is doing, or null when none is running. Held rather than
    // written into the card, because the card is rebuilt on every repaint and the
    // progress has to survive that.
    let sweep = null;
    let sweepAsk = null;
    function askSweep() {
        const why = whyNot();
        if (why) {
            toast(why, true);
            return;
        }
        if (busy) {
            toast("A refine is already running. Let it finish first.", true);
            return;
        }
        if (lastChatId == null) {
            toast("No chat is open, so there is nothing to go through.", true);
            return;
        }
        // Asked first, always. This is the one action in the extension that writes
        // over a whole chat, and it costs a model call per reply. A button that did
        // that on one press would be a button somebody presses once by accident and
        // then has to undo forty times.
        confirmSweep();
    }
    function startSweep() {
        sweep = { at: 0, of: 0, saved: 0, skipped: 0 };
        sweepAsk = newId();
        // The same five-second watchdog every other request gets. A backend that is
        // not running answers nothing at all, and without this the card would sit
        // there counting nothing for the rest of the session.
        armAck();
        log("going through every reply in this chat");
        send({ type: "refine_all", requestId: sweepAsk, chatId: lastChatId });
        paint();
    }
    function refineNow() {
        // One at a time. Two against the same reply means whichever finishes last
        // wins, which is not a thing anybody asked for.
        if (busy) {
            toast("A refine is already running. Press it again to stop that one.", true);
            return;
        }
        const why = whyNot();
        if (why) {
            toast(why, true);
            log("nothing to refine: " + why.toLowerCase().replace(/\.$/, ""));
            return;
        }
        retryAt = 0;
        retryOf = 0;
        markBusy(true);
        paint();
        send({
            type: "refine_now",
            requestId: newId(),
            chatId: lastChatId,
            messageId: lastMessageId,
        });
    }
    // ---- host events ----
    try {
        const offs = [
            ctx.events.on("CHAT_CHANGED", (p) => {
                if (!p)
                    return;
                // A null id here is the build saying you walked out, which is worth
                // believing: it is the only event that reports it directly.
                if (!p.chatId)
                    leftTheChat();
                else
                    sawChat(p.chatId);
                paint();
            }),
            ctx.events.on("CHAT_SWITCHED", (p) => {
                if (!p || typeof p.chatId === "undefined")
                    return;
                if (!p.chatId)
                    leftTheChat();
                else
                    sawChat(p.chatId);
                paint();
            }),
            ctx.events.on("CHARACTER_MESSAGE_RENDERED", (p) => {
                if (!p)
                    return;
                sawChat(p.chatId, p.messageId);
                paint();
            }),
            ctx.events.on("USER_MESSAGE_RENDERED", (p) => {
                if (!p)
                    return;
                sawChat(p.chatId);
                paint();
            }),
            ctx.events.on("GENERATION_ENDED", (p) => {
                if (!p)
                    return;
                sawChat(p.chatId, p.messageId);
                if (cfg.enabled && cfg.refineOn && !p.error && !chatIsOff(p.chatId)) {
                    markBusy(true);
                    paint();
                }
            }),
        ];
        for (const o of offs)
            if (typeof o === "function")
                disposers.push(o);
    }
    catch (_) {
        log("could not listen for replies. Check that the generation permission is granted.");
    }
    // ---- backend messages ----
    try {
        if (ctx && typeof ctx.onBackendMessage === "function") {
            const off = ctx.onBackendMessage((msg) => {
                try {
                    if (!msg)
                        return;
                    if (msg.type === "backend_ready") {
                        armBackend();
                        askPermissions();
                        send({ type: "list_connections", requestId: newId() });
                        return;
                    }
                    // Progress from the backend. A model that streams reports as it
                    // goes; one that does not says asking and then checking, which is
                    // still two states rather than one long silence.
                    if (msg.type === "refine_progress") {
                        // First, because this is what starts a run, and what starts a run
                        // clears the counter and the working left over from the last one.
                        // Reading them first meant the first progress message of a refine
                        // wrote its working down and then wiped it a line later, so the
                        // Log only ever kept what the second one carried.
                        markBusy(true, msg.stage);
                        // A backend reporting its progress is a backend that is answering,
                        // which is the whole question the ack watchdog asks. It has to be
                        // said here as well as on the ack, because markBusy arms the
                        // watchdog whenever it turns busy on, and this is the line that
                        // turns it on for a refine the panel did not start itself: the
                        // draft in the input box, and the Try it card. Their ack arrived
                        // and was cleared before there was anything to clear, so the one
                        // armed here had nothing left to answer it and fired five seconds
                        // later, calling a refine that was running perfectly well a backend
                        // that is not installed.
                        clearAck();
                        if (msg.stage === "writing" && typeof msg.chars === "number")
                            streamed = msg.chars;
                        // The working, as it is written. Empty on a prompt that does not
                        // ask for any, which is most of them, and then nothing opens.
                        // The working as it is written, already cut out of its tags by the
                        // backend, kept for the Log rather than put on the page. A card of
                        // its own would have to be handed over to the card saying what the
                        // refine did, and a hand-over between two cards reads as a second
                        // one popping up. The Log holds it at whatever pace suits.
                        if (typeof msg.notes === "string" && msg.notes.trim())
                            liveNotes = msg.notes;
                        if (msg.stage === "retrying") {
                            retryAt = Number(msg.attempt) || 0;
                            retryOf = Number(msg.of) || 0;
                            log("an answer failed a check, asking again");
                        }
                        // Written again now everything this message carried has been read.
                        // markBusy above writes the line as its last act, which is before
                        // the count, the working and the try number have been taken off the
                        // message, so the line showed the numbers from the message before
                        // this one until the clock came round four hundred milliseconds
                        // later. On a model that reports once rather than streaming, that
                        // was the whole of what the reader saw.
                        tickLive();
                        return;
                    }
                    if (msg.type === "permissions") {
                        if (permsAsk && msg.requestId !== permsAsk)
                            return;
                        permsAsk = null;
                        granted = msg.known && Array.isArray(msg.granted) ? msg.granted.map(String) : null;
                        paint();
                        return;
                    }
                    if (msg.type === "permissions_changed") {
                        // A grant given or taken away while the page is open. Nothing
                        // restarts, so the panel asks again rather than going stale.
                        askPermissions();
                        return;
                    }
                    if (msg.type === "active_chat") {
                        // An answer for a question asked before the last chat change is
                        // about a chat nobody is looking at any more.
                        if (chatAsk && msg.requestId !== chatAsk)
                            return;
                        chatAsk = null;
                        const shapeWas = chatShape();
                        if (msg.resolved && !msg.chatId) {
                            // It could look, and there is nothing open. The home screen, or a
                            // character page with no chat started yet.
                            //
                            // Only the question of where you are takes that answer. Asked
                            // who is in a chat we were already told about, "nothing is open"
                            // is about the server's idea of the active chat and not about
                            // that one, and believing it was what put the panel back on "No
                            // chat open" the instant a character was tapped: on Lumiverse
                            // that is the move that creates a chat, and a chat made a moment
                            // ago is not the active one yet.
                            if (chatAskWhy === "where")
                                leftTheChat();
                            return;
                        }
                        if (msg.chatId) {
                            // An id read out of the address is not a chat until the backend
                            // has found one under it. Without this, an address that happens
                            // to carry something id-shaped in the remembered place would put
                            // the panel in a chat that does not exist, which is worse than
                            // the fault this is here to fix.
                            if (chatAskWhy === "guess" && !msg.found)
                                return;
                            // The one stale answer worth dropping: the chat you just walked
                            // out of, which the backend goes on naming while you stand on the
                            // home screen. Anything else is taken, because a chat opened by
                            // tapping a character can be named here a moment before its id
                            // reaches the address bar, and refusing that answer was half of
                            // why the panel sat there saying no chat was open.
                            if (urlNamesChats &&
                                leftBehind != null &&
                                String(msg.chatId) === String(leftBehind) &&
                                !urlHolds(msg.chatId))
                                return;
                            // The same answer with nothing walked out of yet, which is where
                            // the panel stands the moment it is set up: the extension being
                            // updated rebuilds it in place, and it comes back knowing
                            // nothing. Asked which chat is open, the backend answers with the
                            // account's most recent one, and on the home screen that is the
                            // chat you left before the update. leftBehind is empty, so the
                            // check above has nothing to recognise it by, and the panel came
                            // back saying it was ready to refine in a chat nobody was in.
                            //
                            // The address settles it on any build whose addresses name chats.
                            // One that names none has only the backend to go on and cannot
                            // tell the two apart; the asking below is what it has instead.
                            if (chatAskWhy === "where" && urlSlot != null && !addressHas(msg.chatId)) {
                                if (idInUrl() == null)
                                    leftTheChat();
                                return;
                            }
                            sawChat(msg.chatId);
                            character = msg.character ? String(msg.character) : null;
                            // A chat with a card whose name did not come back is a chat the
                            // characters permission was refused for, which is worth telling
                            // apart from a chat that has no card.
                            nameWithheld = !!msg.hasCharacter && !msg.character;
                            // Only an answer from a backend that could actually look counts.
                            // One from a backend that could not is not evidence of no card,
                            // and treating it as such would call every chat temporary for the
                            // rest of the page.
                            if (msg.resolved) {
                                if (msg.hasCharacter)
                                    cardless.delete(String(msg.chatId));
                                else
                                    cardless.add(String(msg.chatId));
                            }
                        }
                        // Only when the answer said something the panel is showing.
                        if (chatShape() !== shapeWas)
                            paint();
                        return;
                    }
                    if (msg.type === "connections") {
                        const list = Array.isArray(msg.list) ? msg.list : [];
                        let same = list.length === connections.length;
                        if (same)
                            for (let i = 0; i < list.length; i++)
                                if (JSON.stringify(list[i]) !== JSON.stringify(connections[i])) {
                                    same = false;
                                    break;
                                }
                        connections = list;
                        if (!same)
                            paint();
                        return;
                    }
                    if (msg.type === "refined") {
                        markBusy(false);
                        keepNotes({ chatId: msg.chatId, messageId: msg.messageId, ok: true });
                        tally.saved++;
                        lastRun = { ms: lastRunMs, ok: true, why: "" };
                        // A refine only happens in the chat the reader is in, so this is
                        // also the chat. Adopted when nothing else has said so yet, or the
                        // panel would hold a refine it could not show anybody.
                        if (msg.chatId != null && lastChatId == null)
                            lastChatId = msg.chatId;
                        if (msg.chatId != null && msg.canUndo) {
                            const k = undoKey(msg.chatId, msg.messageId);
                            undoable.delete(k);
                            undoable.set(k, {
                                chatId: msg.chatId,
                                messageId: msg.messageId,
                                before: String(msg.before || ""),
                                after: String(msg.after || ""),
                                at: Date.now(),
                            });
                            while (undoable.size > UNDO_MAX)
                                undoable.delete(undoable.keys().next().value);
                            showPop(undoable.get(k));
                        }
                        // The badge is the point of the tab being closable: something
                        // happened to your writing and you can see that without opening it.
                        setBadge(String(undoHere().length || 1));
                        log("refined a reply in " + (lastRunMs / 1000).toFixed(1) + "s", true);
                        toast("Reply refined.");
                        ping();
                        paint();
                        return;
                    }
                    if (msg.type === "loaded_settings") {
                        tookAccountSettings(msg);
                        return;
                    }
                    if (msg.type === "loaded_presets") {
                        tookAccountPresets(msg);
                        return;
                    }
                    if (msg.type === "loaded_setups") {
                        tookAccountSetups(msg);
                        return;
                    }
                    if (msg.type === "account_save_failed") {
                        // Settings that look saved and are not is the worst shape this can
                        // take, so it is said plainly rather than logged quietly.
                        const what = String(msg.what || "settings");
                        log("your " + what + " could not be saved to your account. They are still saved in this browser.");
                        toast("Could not save your " + what + " to your account. They are saved in this browser only.", true);
                        paint();
                        return;
                    }
                    if (msg.type === "scan_result") {
                        if (scanWaiting && msg.requestId !== scanWaiting)
                            return;
                        scanWaiting = null;
                        const cl = Array.isArray(msg.cliches) ? msg.cliches : [];
                        const fi = Array.isArray(msg.fillers) ? msg.fillers : [];
                        if (!cl.length && !fi.length) {
                            scanSaid =
                                "Nothing on the phrase list is in this text. That is not the same as nothing to fix: rhythm, repetition and whether a line could sit in any story are what the model is for.";
                        }
                        else {
                            const parts = [];
                            if (cl.length)
                                parts.push("phrases: " + cl.join(", "));
                            if (fi.length)
                                parts.push("filler: " + fi.join(", "));
                            scanSaid = "Found " + parts.join(". ") + ".";
                        }
                        paint();
                        return;
                    }
                    if (msg.type === "refine_ack") {
                        // The backend is there. From here on the deadman is the one
                        // watching, because how long the model takes is its business.
                        clearAck();
                        return;
                    }
                    if (msg.type === "refine_stopped") {
                        // Nothing was running, so nothing is claimed. The busy flag is
                        // cleared regardless: if the panel thought something was running
                        // and the backend says otherwise, the panel is the one that is
                        // wrong, and leaving it spinning is the worse half of that.
                        if (!msg.stopped)
                            log("there was nothing running to stop");
                        markBusy(false);
                        // Half-written working for a refine that will not finish. The Log
                        // keeps what the last finished one worked out, untouched.
                        liveNotes = "";
                        paint();
                        return;
                    }
                    if (msg.type === "shield_bad") {
                        shieldBad = Array.isArray(msg.patterns) ? msg.patterns.map(String).slice(0, 10) : [];
                        if (shieldBad.length)
                            log("some shield patterns could not be read");
                        paint();
                        return;
                    }
                    if (msg.type === "refine_notes") {
                        // The whole of it, from the backend, rather than the tail the
                        // stream was trimmed to. This lands just after the refine did, so
                        // it replaces what was kept a moment ago rather than waiting for
                        // the next one.
                        tookNotes(msg);
                        keepNotes({ chatId: msg.chatId, messageId: msg.messageId, ok: true });
                        paint();
                        return;
                    }
                    if (msg.type === "refine_skipped") {
                        markBusy(false);
                        const why = String(msg.why || "no reason given");
                        tookNotes(msg);
                        keepNotes({ chatId: msg.chatId, messageId: msg.messageId, ok: false, why: why });
                        tally.dropped++;
                        countDrop(why);
                        lastRun = { ms: lastRunMs, ok: false, why: why };
                        log("left a reply alone: " + why);
                        paint();
                        return;
                    }
                    if (msg.type === "refine_result") {
                        markBusy(false);
                        previewBusy = false;
                        // A refine you asked for by hand ends here, and its working is
                        // finished with it whichever way it went.
                        tookNotes(msg);
                        keepNotes({
                            chatId: msg.chatId,
                            messageId: msg.messageId,
                            ok: !!msg.ok,
                            why: String(msg.why || ""),
                        });
                        if (msg.ok) {
                            lastRun = { ms: lastRunMs, ok: true, why: "" };
                            log("refined a reply on request in " + (lastRunMs / 1000).toFixed(1) + "s", true);
                            toast("Reply refined.", true);
                        }
                        else {
                            const why = String(msg.why || "no reason given");
                            tally.dropped++;
                            countDrop(why);
                            lastRun = { ms: lastRunMs, ok: false, why: why };
                            log("could not refine: " + why);
                            toast("Not refined: " + why, true);
                        }
                        paint();
                        return;
                    }
                    if (msg.type === "try_result" && !msg.requestId) {
                        // Same: an answer from the net rather than from the handler.
                        markBusy(false);
                        tryBusy = false;
                        tryWaiting = null;
                        inputWaiting = null;
                        tryResult = { ok: false, text: String(msg.why || "It could not be run.") };
                        paint();
                        return;
                    }
                    if (msg.type === "try_result") {
                        // Whichever of the two asked, the run is over. Nothing else clears
                        // this for them: the endings that do belong to a refine of a saved
                        // reply, so a draft refine turned the widget on and left it turning
                        // until the deadman timer came due a minute and a half later.
                        markBusy(false);
                        // The input bar and the Try it box use the same request, so the
                        // waiting id is what says where the answer goes.
                        if (inputWaiting === msg.requestId) {
                            inputWaiting = null;
                            const node = inputNode || composer();
                            inputNode = null;
                            // The working, kept the same way a reply's is. The backend sends
                            // it on this message as well, and it was being read off the
                            // progress messages and then dropped here, so a draft refine was
                            // the one kind whose working reached the panel and never reached
                            // the Log. Kept whether the rewrite was saved or not, since the
                            // working is most worth reading on the one that was refused.
                            tookNotes(msg);
                            keepNotes({ chatId: lastChatId, ok: !!msg.ok, why: String(msg.why || ""), mine: true });
                            if (!msg.ok) {
                                const why = String(msg.why || "no reason given");
                                countDrop(why);
                                log("did not touch your draft: " + why);
                                toast("Left your draft alone: " + why, true);
                            }
                            else if (!node) {
                                log("the input box went away before the refine came back");
                                toast("The input box went away before it came back.", true);
                            }
                            else if (setComposer(node, String(msg.after || ""))) {
                                log("refined what you were typing", true);
                                toast("Your draft was refined.");
                                lastDraft = {
                                    before: inputBefore,
                                    after: String(msg.after || ""),
                                    at: Date.now(),
                                    node: node,
                                };
                                watchDraft(node);
                                showDraftPop(inputBefore, String(msg.after || ""));
                                ping();
                            }
                            else {
                                log("could not write to the input box");
                                toast("Could not write to the input box.", true);
                            }
                            paint();
                            return;
                        }
                        if (tryWaiting !== msg.requestId)
                            return;
                        tryWaiting = null;
                        tryBusy = false;
                        tryResult = msg.ok
                            ? { ok: true, text: String(msg.after || "") }
                            : {
                                ok: false,
                                text: "This would not have been saved: " +
                                    String(msg.why || "no reason given") +
                                    (msg.after ? "\n\nWhat came back:\n" + String(msg.after) : ""),
                            };
                        paint();
                        return;
                    }
                    if (msg.type === "undo_result") {
                        // What was asked about, which the panel wrote down when it asked.
                        // The answer says so too now, and either will do; taking ours
                        // first means a host that drops fields on the way through cannot
                        // leave the panel unable to tell which message came back.
                        const about = undoAsked.get(String(msg.requestId)) ||
                            (msg.messageId != null ? { chatId: msg.chatId, messageId: msg.messageId } : null);
                        undoAsked.delete(String(msg.requestId));
                        if (msg.ok) {
                            if (about)
                                undoable.delete(undoKey(about.chatId, about.messageId));
                            // The card on the page is about this refine, and this refine is
                            // gone. Closed whichever way the undo was asked for, so putting
                            // one back from the Log does not leave the card offering to do
                            // it again.
                            if (about && popKey === undoKey(about.chatId, about.messageId))
                                dropPop();
                            if (!undoHere().length)
                                setBadge(null);
                            tally.undone++;
                            log("put a reply back the way it was", true);
                            toast("Put back.", true);
                        }
                        else {
                            log("could not put it back: " + String(msg.why || "no reason given"));
                        }
                        paint();
                        return;
                    }
                    if (msg.type === "confirm_refine") {
                        markBusy(false);
                        // The model has finished and is waiting on your yes, so its working
                        // is finished with it and belongs in the Log whichever way you
                        // answer.
                        keepNotes({ chatId: msg.chatId, messageId: msg.messageId, ok: true });
                        pending = {
                            chatId: msg.chatId,
                            messageId: msg.messageId,
                            before: String(msg.before || ""),
                            after: String(msg.after || ""),
                            at: Date.now(),
                        };
                        setBadge("1");
                        log("a refine is waiting for you", true);
                        ping();
                        paint();
                        // And as a modal where the host can draw one, since this is a
                        // question holding something up. The card is the same decision and
                        // stays until one of them is answered.
                        askToSave(msg);
                        return;
                    }
                    if (msg.type === "refine_all_progress") {
                        if (sweepAsk && msg.requestId !== sweepAsk)
                            return;
                        sweep = {
                            at: Number(msg.at) || 0,
                            of: Number(msg.of) || 0,
                            saved: Number(msg.saved) || 0,
                            skipped: Number(msg.skipped) || 0,
                        };
                        // Each message proves the sweep is alive, so the watchdog is set
                        // again from here. One that never fires is one message going
                        // missing rather than the whole run, which is the case the panel
                        // could not otherwise tell from a very slow model.
                        armSweepWatch();
                        paint();
                        return;
                    }
                    if (msg.type === "refine_all_done") {
                        if (sweepAsk && msg.requestId !== sweepAsk)
                            return;
                        sweepAsk = null;
                        sweep = null;
                        clearSweepWatch();
                        const saved = Number(msg.saved) || 0;
                        const left = Number(msg.skipped) || 0;
                        // Every ending says what happened to the chat, including the ones
                        // where nothing happened. A sweep that finds nothing to do and says
                        // nothing reads exactly like a button that did not work.
                        const count = saved + left === 0
                            ? "There was no reply here to refine."
                            : saved +
                                (saved === 1 ? " reply refined" : " replies refined") +
                                (left ? ", " + left + " left alone" : "") +
                                (msg.stopped ? ", stopped partway" : "") +
                                ".";
                        const why = String(msg.why || "").trim();
                        log(count.toLowerCase().replace(/\.$/, ""), saved > 0);
                        if (why)
                            log("what stopped the rest: " + why);
                        toast(count + (why ? " " + why + "." : ""), !saved);
                        paint();
                        return;
                    }
                    if (msg.type === "prompt_preview") {
                        // A failure answered by the outer net carries no requestId, and it
                        // still has to clear the spinner.
                        if (msg.requestId && previewWaiting !== msg.requestId)
                            return;
                        previewWaiting = null;
                        previewBusy = false;
                        preview = msg;
                        paint();
                        return;
                    }
                }
                catch (_) { }
            });
            if (typeof off === "function")
                disposers.push(off);
        }
    }
    catch (_) { }
    // The second question worth a modal, for the same reason as the first: it is
    // asked before anything is written and the answer decides whether a whole
    // chat gets rewritten.
    //
    // A host with no modal is not a reason to skip the question. It falls back to
    // the browser's own confirm, and if there is not one of those either the
    // sweep does not run: going ahead unasked is the one answer that is wrong.
    function confirmSweep() {
        const many = "This rewrites every reply in this chat, one model call each.";
        const back = "The greeting and your own messages are left alone, and each rewrite can be put back from the Log.";
        try {
            if (ctx.ui && typeof ctx.ui.showModal === "function") {
                const modal = ctx.ui.showModal({ title: "Refine every reply here?" });
                const root = modal.root;
                root.innerHTML = "";
                root.className = "arf";
                root.appendChild(el("div", "arf-well", many + " " + back));
                const bar = el("div", "arf-row");
                const yes = button("Go through the chat", true);
                yes.setAttribute("data-arf-sweep-yes", "1");
                const no = button("Not now", false);
                const shut = () => {
                    try {
                        modal.dismiss && modal.dismiss();
                    }
                    catch (_) { }
                };
                yes.addEventListener("click", () => {
                    shut();
                    startSweep();
                });
                no.addEventListener("click", shut);
                bar.appendChild(yes);
                bar.appendChild(no);
                root.appendChild(bar);
                return;
            }
        }
        catch (_) { }
        try {
            if (typeof globalThis.confirm === "function") {
                if (globalThis.confirm(many + "\n\n" + back))
                    startSweep();
                return;
            }
        }
        catch (_) { }
        toast("This build cannot ask you first, and this is not something to start unasked.", true);
    }
    // The one modal in the extension, and it earns it: this is a question that
    // has to be answered before anything is written, which is exactly the moment
    // a modal is for. Everything else lives in the tab.
    function askToSave(msg) {
        try {
            if (!ctx.ui || typeof ctx.ui.showModal !== "function")
                return;
            const modal = ctx.ui.showModal({ title: "Save this refine?" });
            const root = modal.root;
            root.innerHTML = "";
            root.className = "arf";
            root.style.maxHeight = "70vh";
            root.style.overflowY = "auto";
            const pane = (title, text) => {
                root.appendChild(heading(title));
                root.appendChild(el("div", "arf-well", text));
            };
            pane("As it is now", String(msg.before || ""));
            pane("After the refine", String(msg.after || ""));
            const bar = el("div", "arf-row");
            const yes = button("Save it", true);
            const no = button("Leave it alone", false);
            // Both buttons go through the same place the card's do, so answering
            // either settles the other. Two surfaces, one decision.
            const shut = () => {
                try {
                    modal.dismiss && modal.dismiss();
                }
                catch (_) { }
            };
            yes.addEventListener("click", () => {
                takePending(true);
                shut();
            });
            no.addEventListener("click", () => {
                takePending(false);
                shut();
            });
            bar.appendChild(yes);
            bar.appendChild(no);
            root.appendChild(bar);
        }
        catch (_) { }
    }
    // ---- start ----
    try {
        if (ctx.ui && typeof ctx.ui.registerDrawerTab === "function") {
            tab = ctx.ui.registerDrawerTab({
                id: "auto-refine",
                title: "Auto Refine",
                shortName: "Refine",
                description: "Rewrite each reply to follow rules you write, and put one back if you disagree",
                // What the command palette searches, written for somebody who does not
                // already know the extension by name.
                keywords: ["refine", "rewrite", "polish", "edit", "prose", "style", "rules"],
                iconSvg: refineIcon(),
            });
            disposers.push(() => {
                try {
                    tab && tab.destroy && tab.destroy();
                }
                catch (_) { }
            });
        }
    }
    catch (_) { }
    injectStyle();
    armBackend();
    syncExtras();
    askWhereWeAre();
    // And keep asking for the next few seconds. A backend asked the instant it
    // came up answers with what it knows then, which after the extension is
    // updated is nothing, and a single answer taken as final leaves the panel
    // wrong about the chat somebody is sitting in until they walk out and back
    // in. The chase stops the moment an answer names a chat.
    chasing = CHASE_TICKS;
    // From here rather than from the first chat seen. A tab opened on the home
    // screen has no chat to watch, and waiting for one would leave the move it
    // most needs to notice, a character being tapped, as the one move nothing is
    // looking for.
    startUrlWatch();
    askPermissions();
    // After armBackend, so the replies have somewhere to land. Both are
    // fire and forget: the panel is already drawn from the browser's cache, and
    // the account copy repaints it when it arrives.
    loadFromAccount();
    loadPresetsFromAccount();
    loadSetupsFromAccount();
    send({ type: "list_connections", requestId: newId() });
    log("ready v" + VERSION);
    paint();
    return () => {
        if (saveTimer) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
        for (const d of disposers.splice(0)) {
            try {
                d();
            }
            catch (_) { }
        }
        tab = null;
    };
}
// The defaults and the fields built from them, so a check can hold the two
// against each other. A setting in one and not the other looks fine and quietly
// never loads.
export const __testing = {
    CONFIG,
    COST_FIELDS,
    LIMIT_FIELDS,
    MACROS,
    BUILT_IN_PROMPTS,
    DEFAULT_BLOCKS,
    ROLE_OPTIONS,
    SAMPLER_FIELDS,
    refineIcon,
    VERSION,
    // Pure, so a theme with a light accent can be checked without a browser.
    parseColor,
    blendColor,
    relLuminance,
    contrastRatio,
    betterInk,
    TEXT_FLOOR,
    BIG_TEXT_FLOOR,
    FILL_FLOOR,
};
