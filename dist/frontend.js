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
            "guardRefusal",
            "guardPreamble",
            "guardSoften",
            "softenPct",
            "softenWords",
            "retryRefine",
            "wrapOutput",
            "streamProgress",
            "watchLive",
        ],
    },
    {
        id: "alerts",
        label: "Alerts and sound",
        what: "The pop-up, the sound you attached, and how loud it is.",
        keys: ["toast", "soundOn", "soundUrl", "soundVolume"],
    },
    {
        id: "reach",
        label: "Buttons and the widget",
        what: "The message button, the floating button, and the input bar row.",
        keys: ["msgButton", "widgetOn", "inputRefine"],
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
    // What one tap does when there is a refine to put back. On, the button turns
    // into an undo the way the message button does; off, a tap always refines.
    widgetUndo: true,
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
    // Show the rewrite arriving rather than only its length. Off by default: it
    // is a thing to switch on when you want to watch one, not something to pay
    // bridge traffic for on every reply.
    watchLive: false,
    // Asking for the rewrite inside <REFINED> tags rather than on its own. A
    // model that cannot help adding a sentence of its own still puts the rewrite
    // between the tags, and taking what is between them is exact.
    wrapOutput: true,
    // Streaming the refine so the panel can show it arriving. The answer is the
    // same either way; this only decides whether you can watch it.
    streamProgress: true,
    // A button on every message, and one in the input bar. Both off until asked
    // for: they reach into the page, and an extension that redecorates somebody's
    // chat on install is one they uninstall.
    msgButton: false,
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
    { tag: "{{whose}}", what: "A line saying whether the character or the player wrote it.", ours: true },
    { tag: "{{protect_notes}}", what: "Tells it to leave the protection tokens alone. Only appears when there are some.", ours: true },
    { tag: "{{description}}", what: "The character card's description.", ours: false },
    { tag: "{{personality}}", what: "The card's personality.", ours: false },
    { tag: "{{scenario}}", what: "The card's scenario.", ours: false },
    { tag: "{{persona}}", what: "Your persona for this chat.", ours: false },
    { tag: "{{char}}", what: "The character's name.", ours: false },
    { tag: "{{user}}", what: "Your name.", ours: false },
];
const TURN_MACRO = "{{message}}";
// ---- the prompts that ship with it ----
// Two questions, four answers. Does your model reason, and do you want the
// short version or the whole thing.
//
// Short and Detailed are the same instructions. Detailed says each one at
// length and gives it a block of its own; Short says all of it in three. Pick
// by how much prompt you want to pay for on every refine, not by what it
// covers, because they cover the same ground.
//
// A model that reasons is given the standard and left to apply it. A model that
// does not is given the list, because it will match a list and will not derive
// one. That is why the thinking pair is the shorter pair.
const CONTEXT_BLOCKS = [
    {
        id: "character",
        name: "Who the character is",
        on: true,
        role: "system",
        text: "<character>\n{{description}}\n</character>",
    },
    {
        id: "persona",
        name: "Who the player is",
        on: true,
        role: "system",
        text: "<player>\n{{persona}}\n</player>",
    },
    {
        id: "lore",
        name: "What is true in this world",
        on: true,
        role: "system",
        text: "<world>\n{{lore}}\n</world>",
    },
    {
        id: "history",
        name: "What has been happening",
        on: true,
        role: "system",
        text: "<recent_scene>\n{{history}}\n</recent_scene>",
    },
];
const TURN_BLOCK = {
    id: "turn",
    name: "The turn to refine",
    on: true,
    role: "user",
    text: "{{whose}}\n\n<turn_to_refine>\n{{message}}\n</turn_to_refine>",
};
// The tags are shouted. A model skimming a long prompt for the shape of the
// answer finds a run of capitals before it finds a word, and these two are the
// only things in the prompt that have to be got exactly right.
const HOW_TO_ANSWER = {
    id: "answer",
    name: "How to answer",
    on: true,
    role: "system",
    text: "<how_to_answer>\n" +
        "Put the rewritten message between <REFINED> and </REFINED>. Only what is " +
        "between those two tags is saved, so the tags are not optional.\n\n" +
        "Inside the tags, write the message and nothing else. No preamble, no " +
        "heading, no note about what you changed.\n\n" +
        "Anything you write outside the tags is shown to me and never saved into " +
        "the chat. Leave it empty unless something above asked you for it.\n" +
        "</how_to_answer>\n\n" +
        "{{protect_notes}}",
};
// The thinking version. It asks for the working in a tag of its own, before the
// rewrite, and that tag is outside <REFINED> so none of it can reach the chat.
// It is shown in the panel beside the refine instead, which is what makes
// asking for it worth the tokens: reasoning nobody ever reads is only a bill.
//
// Only the reasoning prompts carry this. A model that does not reason given a
// thinking tag fills it with a summary of what it is about to do and then does
// something else, which costs output and buys a paragraph nobody wanted.
const THINKS_ANSWER = {
    id: "answer",
    name: "How to answer",
    on: true,
    role: "system",
    text: "<how_to_answer>\n" +
        "Answer in two parts, in this order.\n\n" +
        "First, your working, between <REFINE_NOTES> and </REFINE_NOTES>. Name what " +
        "is weak in the message as it stands, say what you intend to change and " +
        "why, and say what you looked at and chose to leave. Be specific: quote " +
        "the phrases you mean. This is for me to read, not for the story.\n\n" +
        "Then the rewritten message, between <REFINED> and </REFINED>. Only what is " +
        "between those two tags is saved, so the tags are not optional. Inside " +
        "them, write the message and nothing else: no preamble, no heading, and no " +
        "note about what you changed, because that is what the first part was for.\n\n" +
        "Nothing outside <REFINED> is ever saved into the chat, so your notes cost " +
        "the story nothing.\n" +
        "</how_to_answer>\n\n" +
        "{{protect_notes}}",
};
// The list of phrases, which is the same list in both lengths. These are the
// ones that show up in machine-written roleplay several times a session and in
// published fiction almost never.
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
const DO_NOT_TOUCH = {
    id: "hands_off",
    name: "What not to touch",
    on: true,
    role: "system",
    text: "<leave_these_exactly>\n" +
        "Some of what you are given is not prose. Copy it through character for " +
        "character, in the same place it was:\n\n" +
        "- HTML and XML tags, and everything inside the angle brackets\n" +
        "- tokens shaped like [[AR1]], which stand for formatting taken out before " +
        "you saw it\n" +
        "- code, fenced or inline, and anything in backticks\n" +
        "- links, image links and file paths\n" +
        "- stat blocks, status bars, trackers, inventories, timestamps, and any " +
        "line printed to the same shape every turn\n" +
        "- a second language beside the first, and the line translating it: change " +
        "neither, reorder neither\n" +
        "- names as spelled, including odd spellings and capitalisation\n" +
        "- numbers, dates, times and measurements\n\n" +
        "If you are unsure whether something is prose, it is not. Leave it.\n" +
        "</leave_these_exactly>",
};
const JOB_BLOCK = {
    id: "job",
    name: "The job",
    on: true,
    role: "system",
    text: "<your_job>\n" +
        "You are editing one message from a story two people are writing together. " +
        "Someone wrote this message. You are fixing how it reads, not writing the " +
        "next one.\n\n" +
        "The events stay. The speech stays. What anyone means stays. Nobody new " +
        "arrives, nothing new happens, and the scene ends where it ended.\n" +
        "</your_job>",
};
// ---- the plain model, short ----
// Three rule blocks holding everything the detailed version holds.
const PLAIN_SHORT = [
    JOB_BLOCK,
    ...CONTEXT_BLOCKS,
    {
        id: "cut",
        name: "Cut these",
        on: true,
        role: "system",
        text: "<cut_these>\n" +
            "Cut these wherever they appear:\n\n" +
            PHRASES +
            "\n\nCut these words unless the sentence stops working without them: " +
            FILLER +
            ".\n\n" +
            "Cut the sentence that restates the one before it in other words. Cut " +
            "the speech tag that explains the line, such as she said angrily. Cut " +
            "the label on a feeling the scene already shows.\n\n" +
            "When you cut, do not write a replacement. The message is usually better " +
            "one sentence shorter.\n" +
            "</cut_these>",
    },
    {
        id: "fix",
        name: "Fix these",
        on: true,
        role: "system",
        text: "<fix_these>\n" +
            "Hands, eyes and breath do not act alone. Her hand found his becomes she " +
            "took his hand.\n\n" +
            "Three sentences of the same length in a row: change one. Three " +
            "fragments in a row: change one.\n\n" +
            "Three physical details stacked on one moment: keep the one that carries " +
            "it.\n\n" +
            "The last line stays the last line. Do not add one that points at what " +
            "happens next, and do not turn it into a question for the other person.\n" +
            "</fix_these>",
    },
    {
        id: "leave",
        name: "What to leave alone",
        on: true,
        role: "system",
        text: "<leave_it_alone>\n" +
            "A passage that is already good comes back exactly as it was. Rewriting " +
            "what did not need it is the failure that costs most here, because it " +
            "takes away a line the writer chose and they cannot see what you " +
            "changed.\n\n" +
            "Your rewrite is not longer than what you were given. If it is, you " +
            "added instead of fixing.\n" +
            "</leave_it_alone>",
    },
    DO_NOT_TOUCH,
    HOW_TO_ANSWER,
    TURN_BLOCK,
];
// ---- the plain model, in full ----
// The same rules, one to a block, each said at length.
const PLAIN_LONG = [
    JOB_BLOCK,
    ...CONTEXT_BLOCKS,
    {
        id: "cut",
        name: "Phrases to cut",
        on: true,
        role: "system",
        text: "<phrases_to_cut>\n" +
            "These appear in machine-written roleplay several times a session and in " +
            "published fiction almost never. Cut every one you find:\n\n" +
            PHRASES +
            "\n\nCut a phrase rather than swapping it for a near neighbour. If the " +
            "moment still needs carrying, carry it with what this person is doing in " +
            "this room, and if nothing is happening there, let the line go.\n" +
            "</phrases_to_cut>",
    },
    {
        id: "words",
        name: "Words to cut",
        on: true,
        role: "system",
        text: "<words_to_cut>\n" +
            "Cut these unless the sentence stops working without them: " +
            FILLER +
            ".\n\n" +
            "Cut an adverb that repeats what its verb already said: whispered " +
            "quietly, hurried quickly.\n\n" +
            "Cut an intensifier doing the work a stronger word would do on its own. " +
            "Very tired is tired said weakly; exhausted is the word.\n" +
            "</words_to_cut>",
    },
    {
        id: "repeats",
        name: "Repetition",
        on: true,
        role: "system",
        text: "<repetition>\n" +
            "Read the message twice: once for sense, once for what it says twice.\n\n" +
            "The commonest fault in a message like this is a sentence that restates " +
            "the one before it in other words. One of the two is doing the work. " +
            "Keep that one and cut the other.\n\n" +
            "Watch for a word used twice in three lines where the second use was not " +
            "meant as an echo.\n" +
            "</repetition>",
    },
    {
        id: "rhythm",
        name: "Rhythm",
        on: true,
        role: "system",
        text: "<rhythm>\n" +
            "Read for length before you read for meaning. Three sentences of about " +
            "the same length in a row is a rhythm a reader stops hearing: change one " +
            "of them.\n\n" +
            "A fragment lands once. Three in a row is a tic.\n\n" +
            "A paragraph that runs past six lines usually holds two paragraphs.\n" +
            "</rhythm>",
    },
    {
        id: "speech",
        name: "Speech",
        on: true,
        role: "system",
        text: "<speech>\n" +
            "Every line keeps its meaning. Fix phrasing that is stiff or unnatural. " +
            "Do not change what was said, and do not add a line nobody said.\n\n" +
            "Cut the tag that explains the line: she said angrily, he asked, " +
            "curious. If the tone is not in the words, fix the words.\n\n" +
            "Cut speech that repeats back what the other person just did before " +
            "answering it.\n\n" +
            "Keep a character who speaks badly speaking badly. Clipped, rambling, " +
            "plain or crude is a voice, and smoothing it is not an improvement.\n" +
            "</speech>",
    },
    {
        id: "bodies",
        name: "Bodies and feeling",
        on: true,
        role: "system",
        text: "<bodies_and_feeling>\n" +
            "Hands, eyes and breath do not act on their own. Her hand found his " +
            "becomes she took his hand. His eyes traced her face becomes he looked " +
            "at her.\n\n" +
            "Feeling belongs in what someone does. Do not name it as well: if she is " +
            "already pulling her coat closed, do not add that she felt exposed.\n\n" +
            "One physical detail at a time. Three stacked together is a list, and a " +
            "reader skims a list.\n\n" +
            "A heartbeat, a shiver or a held breath standing in for an emotion is " +
            "the emotion left unwritten. Write what the person does instead.\n" +
            "</bodies_and_feeling>",
    },
    {
        id: "endings",
        name: "How it ends",
        on: true,
        role: "system",
        text: "<how_it_ends>\n" +
            "The message ends where it ends. Do not add a closing line pointing at " +
            "what happens next, and do not turn the last line into a question aimed " +
            "at the other person.\n\n" +
            "If it already ends on a hook, keep the hook. The shape of the turn is " +
            "not yours to change.\n" +
            "</how_it_ends>",
    },
    {
        id: "leave",
        name: "What to leave alone",
        on: true,
        role: "system",
        text: "<leave_it_alone>\n" +
            "A passage that is already good comes back exactly as it was. Rewriting " +
            "what did not need it is the failure that costs most here, because it " +
            "takes away a line the writer chose and they cannot see what you " +
            "changed.\n\n" +
            "Your rewrite is not longer than what you were given. If it is, you " +
            "added instead of fixing.\n\n" +
            "If you find nothing worth changing, return the message unchanged.\n" +
            "</leave_it_alone>",
    },
    DO_NOT_TOUCH,
    HOW_TO_ANSWER,
    TURN_BLOCK,
];
const THINKS_JOB = {
    id: "job",
    name: "The job",
    on: true,
    role: "system",
    text: "<your_job>\n" +
        "You are editing one message from a story two people are writing together. " +
        "Work out what is weak in how it is written, then fix that.\n\n" +
        "The events stay. The speech stays. What anyone means stays. Nobody new " +
        "arrives, nothing new happens, and the scene ends where it ended.\n" +
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
        "A sentence that could sit anywhere is the one to fix. Put in its place " +
        "what is true of this person, in this room, right now. If nothing is true " +
        "there, cut the line and write no replacement.\n\n" +
        "Ask it of speech, of gesture, of description. Ask it of your own rewrite " +
        "before you answer.\n" +
        "</the_standard>",
};
const RESTRAINT = {
    id: "restraint",
    name: "Restraint",
    on: true,
    role: "system",
    text: "<restraint>\n" +
        "A passage that is already good comes back exactly as it was.\n\n" +
        "Do not lengthen the message to improve it. Shorter with nothing wasted is " +
        "the answer more often than not.\n" +
        "</restraint>",
};
// The prompt for your own messages. A different job: your writing is already
// in your voice, and the failure to avoid is a refine that makes you sound like
// the narrator. Shorter than the reply prompt because there is less to do.
const YOURS_DEFAULT = [
    {
        id: "job",
        name: "The job",
        on: true,
        role: "system",
        text: "<your_job>\n" +
            "You are tidying one message written by the player in a story two people " +
            "are writing together. Fix how it reads. Do not write for them.\n\n" +
            "Everything they did, said and meant stays. Do not add an action, a line " +
            "of speech, or a reaction they did not write. Do not answer for the " +
            "character.\n" +
            "</your_job>",
    },
    ...CONTEXT_BLOCKS,
    {
        id: "voice",
        name: "Their voice",
        on: true,
        role: "system",
        text: "<their_voice>\n" +
            "This is the player writing, not the narrator. Keep how they write.\n\n" +
            "If they write in short plain lines, keep them short and plain. If they " +
            "write lower case, keep it lower case. If they write in the present tense " +
            "or the first person, do not move them out of it. A message that comes " +
            "back in polished third person is a message they will not recognise as " +
            "their own.\n\n" +
            "Their length is their choice. A one line message stays a one line " +
            "message.\n" +
            "</their_voice>",
    },
    {
        id: "fix",
        name: "What to fix",
        on: true,
        role: "system",
        text: "<what_to_fix>\n" +
            "Typing mistakes, missing words, a word plainly meant to be another one.\n\n" +
            "Punctuation and capitalisation, unless they are writing lower case on " +
            "purpose, in which case leave it.\n\n" +
            "A sentence that has come out tangled enough to be hard to follow. Say " +
            "the same thing in the same voice, more clearly.\n\n" +
            "Nothing else. Do not improve their word choice, do not add detail, and " +
            "do not make a plain line more vivid.\n" +
            "</what_to_fix>",
    },
    DO_NOT_TOUCH,
    HOW_TO_ANSWER,
    TURN_BLOCK,
];
// ---- a model that reasons, short ----
const THINKS_SHORT = [
    THINKS_JOB,
    ...CONTEXT_BLOCKS,
    THE_STANDARD,
    RESTRAINT,
    DO_NOT_TOUCH,
    THINKS_ANSWER,
    TURN_BLOCK,
];
// ---- a model that reasons, in full ----
// The same standard, plus where to point it and a pass over its own answer.
const THINKS_LONG = [
    THINKS_JOB,
    ...CONTEXT_BLOCKS,
    THE_STANDARD,
    {
        id: "where",
        name: "Where to look",
        on: true,
        role: "system",
        text: "<where_to_look>\n" +
            "Five places account for most of what goes wrong in a message like this. " +
            "Check each before deciding the message is fine.\n\n" +
            "The second sentence. It often restates the first in other words. One of " +
            "the two is doing the work.\n\n" +
            "The body. Hands and eyes acting alone, a heartbeat standing in for a " +
            "feeling, three physical details where one would land.\n\n" +
            "The speech tag. If it explains the tone, the line under it is not " +
            "carrying its weight.\n\n" +
            "The stock phrase. A held breath, a hammering heart, a whisper, a " +
            "shiver, air thick with something. These arrive by habit rather than by " +
            "choice.\n\n" +
            "The last line. A turn ending by pointing at what comes next is asking " +
            "the other writer to do the work.\n" +
            "</where_to_look>",
    },
    {
        id: "voice",
        name: "Voice",
        on: true,
        role: "system",
        text: "<voice>\n" +
            "The message has a voice. Yours is not it. Fix what is weak in the voice " +
            "that is there rather than replacing it with a cleaner one.\n\n" +
            "This matters most with a character who speaks badly on purpose: " +
            "clipped, rambling, plain, crude. Smoothing that is not an improvement, " +
            "it is a different character.\n" +
            "</voice>",
    },
    RESTRAINT,
    DO_NOT_TOUCH,
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
            "Is yours longer? Find what you added and decide whether it earns its " +
            "place. It usually does not.\n" +
            "</before_you_answer>",
    },
    THINKS_ANSWER,
    TURN_BLOCK,
];
// What a fresh install starts on. The short plain one, because it is the prompt
// that works on the widest set of models and is the easiest to read before you
// start editing it.
const DEFAULT_BLOCKS = PLAIN_SHORT;
const BUILT_IN_PROMPTS = [
    {
        name: "Short",
        blocks: PLAIN_SHORT,
        thinking: "off",
        what: "The one to start with. Everything the detailed version says, said in three blocks instead of nine. Same rules, less prompt to pay for on every refine.",
    },
    {
        name: "Detailed",
        blocks: PLAIN_LONG,
        thinking: "off",
        what: "The same rules, one to a block, each said at length: phrases, words, repetition, rhythm, speech, bodies, endings. Costs more per refine and is followed more closely.",
    },
    {
        name: "Short, for a thinking model",
        blocks: THINKS_SHORT,
        thinking: "inherit",
        what: "Gives your model the standard and lets it work out the rest. Shorter than the plain pair on purpose: a model that reasons does not need the list.",
    },
    {
        name: "Detailed, for a thinking model",
        blocks: THINKS_LONG,
        thinking: "inherit",
        what: "The standard, the five places to point it, keeping the writer's voice, and a pass over its own answer before it hands it back.",
    },
];
const BUILT_IN = BUILT_IN_PROMPTS.map((p) => p.name);
const ROLE_OPTIONS = [
    { value: "system", label: "System" },
    { value: "user", label: "User" },
    { value: "assistant", label: "Assistant" },
];
// The sampler values that reach the request. Anything not on this list is not
// passed on, on either side of the bridge. Blank means the connection decides,
// which is why none of these carry a default.
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
        hint: "On by default, and the only check that reads the original as well as the rewrite. A softened reply is not a refusal, is the right length, and keeps every protected token: it just came back with the edge taken off, which nothing else here can see. This compares the charged language in the two and refuses a rewrite that dropped most of it. It needs at least three such words in the reply before it can fire, so it stays quiet on prose that never had that register.",
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
        hint: "Optional, one per line, added to the built-in list. That list is short and holds only words that are hard to use innocently, because everyday words like hit, skin or pain would fire on any refine that tightened a description. Add what softening looks like in what you write.",
    },
    {
        key: "retryRefine",
        label: "Ask again when a check fails",
        type: "num",
        min: 0,
        max: 3,
        hint: "How many extra times to ask, and 0 by default. A refusal, a preamble or a sanitised rewrite is usually the same model having a bad turn, not a settled answer, and asking again often comes back clean. Only the failures a second try could fix are retried: a rewrite refused for its length is one the model meant, so asking again buys the same answer at the same price. Every retry is another call on your bill.",
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
        hint: "On by default. When there is a refine to put back, a tap does that instead of refining, the way the message button does. Off, a tap always refines.",
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
        min: 5,
        max: 600,
        hint: "A refine that has not come back by then is cancelled and the reply is left alone.",
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
// Below this, text is repainted near-white or near-black, whichever reads
// better on what is behind it.
const TEXT_FLOOR = 3.2;
// A filled button whose fill is this close to the surface behind it reads as
// plain text however legible its label is, so it is given an edge instead. Low
// enough that a merely quiet accent is left alone.
const FILL_FLOOR = 1.45;
const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const PAGE_FALLBACK = { r: 24, g: 20, b: 34, a: 1 };
function betterInk(back) {
    const onWhite = contrastRatio(WHITE, back);
    const onBlack = contrastRatio(BLACK, back);
    return onWhite >= onBlack
        ? { color: "rgba(255,255,255,0.94)", ratio: onWhite }
        : { color: "rgba(0,0,0,0.9)", ratio: onBlack };
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
    let saveTimer = null;
    function persist(now) {
        const write = () => {
            saveTimer = null;
            try {
                if (typeof localStorage !== "undefined")
                    localStorage.setItem(STORE_KEY, JSON.stringify(cfg));
            }
            catch (_) { }
            send({ type: "set_settings", settings: cfg });
            // The floating button and the Extras row follow the settings that turn
            // them on, and this is the one place every change passes through.
            syncExtras();
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
            send({ type: "set_settings", settings: cfg });
            syncExtras();
            log("settings loaded from your account", true);
            paint();
            return;
        }
        try {
            if (typeof localStorage !== "undefined" && localStorage.getItem(STORE_KEY)) {
                send({ type: "set_settings", settings: cfg });
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
        send({ type: "set_settings", settings: cfg });
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
    const outsideAnyChat = () => noChatOpen && lastChatId == null;
    // ---- knowing when the chat has been left ----
    // Walking out to the home screen, or onto a character page, is the move
    // nothing reliably announces. Some builds send CHAT_SWITCHED with a null id
    // and some say nothing at all, and asking the backend does not settle it
    // either: getActive answers with the account's most recent chat, which on the
    // home screen is the chat you just left.
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
    // Everything that describes the chat you are in, told you are not in one.
    function leftTheChat() {
        noChatOpen = true;
        lastChatId = null;
        lastMessageId = null;
        character = null;
        preview = null;
        stopUrlWatch();
        paint();
    }
    function startUrlWatch() {
        // Read now and not only on the tick. This runs the moment the browser says
        // which chat is open, which is the one moment the address is certain to
        // agree; a first tick landing after somebody has moved on would read an
        // address without the id and prove nothing.
        if (urlHolds(lastChatId))
            urlNamesChats = true;
        if (urlTimer)
            return;
        urlTimer = setInterval(() => {
            if (lastChatId == null) {
                stopUrlWatch();
                return;
            }
            if (urlHolds(lastChatId)) {
                urlNamesChats = true;
                return;
            }
            if (!urlNamesChats)
                return;
            leftTheChat();
            // Moving from one chat straight into another looks the same from here as
            // walking out, so this asks where we ended up.
            askActiveChat();
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
    function askActiveChat() {
        const id = newId();
        chatAsk = id;
        send({ type: "active_chat", requestId: id, chatId: null });
    }
    // The one place a chat id arrives, whichever event carried it, so the flag,
    // the watch and the panel cannot end up disagreeing.
    function sawChat(id, messageId) {
        if (id == null)
            return;
        const changed = String(id) !== String(lastChatId);
        lastChatId = id;
        noChatOpen = false;
        if (messageId != null)
            lastMessageId = messageId;
        if (changed) {
            lastMessageId = messageId != null ? messageId : null;
            character = null;
            preview = null;
            askActiveChat();
        }
        startUrlWatch();
    }
    let busy = false;
    // The refine that can still be undone, per chat. What the tab is really for:
    // seeing what happened to your prose and disagreeing with it.
    // Every refine that can still be put back, newest last, keyed by the chat and
    // the message together. It was one per chat, which meant a second refine in
    // the same chat quietly took away the way back from the first. The backend
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
    // What the run is doing right now. The panel used to know only "busy", so a
    // refine that took forty seconds looked the same as one that had quietly
    // failed, and a model that streams looked the same as one that had not
    // started.
    let stage = "";
    let streamed = 0;
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
        // than as stuck.
        const cap = Number(cfg.timeoutSecs) || 90;
        const left = Math.max(0, cap - secs);
        return "Refining" + clockPart + (secs > 8 ? ", " + left.toFixed(0) + "s left" : "");
    }
    // The last line of defence. Everything else can fail politely; this catches
    // the case where nothing comes back at all, which is what a crashed backend
    // or a dropped bridge message looks like from here. Without it the panel
    // spins until the page is reloaded.
    let deadman = null;
    function armDeadman() {
        if (deadman)
            clearTimeout(deadman);
        const cap = Number(cfg.timeoutSecs) || 90;
        // The backend gives up at the timeout, so this waits a little longer than
        // that: it should only ever fire when the answer itself went missing.
        deadman = setTimeout(() => {
            deadman = null;
            if (!busy)
                return;
            markBusy(false);
            msgBusy = null;
            const why = "nothing came back within " + Math.round(cap + 15) + "s";
            tally.dropped++;
            countDrop(why);
            lastRun = { ms: lastRunMs, ok: false, why: why };
            log("gave up waiting: " + why);
            toast("The refine never came back. Nothing was changed.", true);
            paint();
        }, Math.min(700, Math.max(20, cap + 15)) * 1000);
    }
    disposers.push(() => {
        if (deadman)
            clearTimeout(deadman);
        deadman = null;
    });
    function markBusy(on, why) {
        if (on && !busy) {
            runStartedAt = Date.now();
            streamed = 0;
            armDeadman();
        }
        if (!on && deadman) {
            clearTimeout(deadman);
            deadman = null;
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
    // Everything that shows a live state, written in place. A repaint once a
    // second would close an open select and take the cursor out of whatever box
    // somebody was typing in.
    function tickLive() {
        try {
            if (liveEls) {
                const st = statusLine();
                liveEls.text.textContent = busy ? stageWords() : st.text;
                liveEls.dot.className =
                    "arf-dot" + (busy ? " arf-busy" : st.tone === "off" ? "" : " arf-live");
            }
        }
        catch (_) { }
        paintFloat();
        if (cfg.msgButton && cfg.enabled)
            sweepMsgButtons();
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
        ".arf-btn.arf-primary{background:var(--lumiverse-primary,rgba(147,112,219,.9));color:#fff}" +
        ".arf-btn.arf-primary:hover:not(:disabled){background:var(--lumiverse-primary-hover,rgba(167,132,239,.95))}" +
        ".arf-btn:disabled{opacity:.5;cursor:not-allowed}" +
        ".arf-btn:focus-visible{outline:none;box-shadow:" + FOCUS_RING + "}" +
        ".arf-box{width:17px;height:17px;flex:none;cursor:pointer;accent-color:var(--lumiverse-primary,rgba(147,112,219,.9))}" +
        ".arf-well{white-space:pre-wrap;line-height:1.5;font-size:12.5px;padding:8px 10px;" +
        "border-radius:var(--lumiverse-radius,8px);" +
        "border:1px solid var(--lumiverse-border-neutral,rgba(128,128,128,.15));" +
        "background:var(--lumiverse-fill,rgba(0,0,0,.15))}" +
        ".arf-well.arf-dim{color:var(--lumiverse-text-muted,rgba(255,255,255,.65))}" +
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
        ".arf-msgbtn{display:inline-flex;align-items:center;justify-content:center;" +
        "background:none;border:0;padding:4px;cursor:pointer;border-radius:var(--lumiverse-radius-sm,5px);" +
        "color:var(--lumiverse-text-muted,rgba(255,255,255,.65));" +
        "transition:color var(--lumiverse-transition-fast,150ms ease)}" +
        ".arf-msgbtn:hover:not(:disabled){color:var(--lumiverse-text,rgba(255,255,255,.9))}" +
        ".arf-msgbtn:disabled{cursor:default}" +
        ".arf-msgbtn:focus-visible{outline:none;box-shadow:" + FOCUS_RING + "}" +
        "@keyframes arf-turn{to{transform:rotate(360deg)}}" +
        ".arf-spin{animation:arf-turn 900ms linear infinite;transform-origin:50% 50%}" +
        // A reader who has asked for less movement gets a still icon rather than a
        // spinner, and the button's title still says it is working.
        "@media (prefers-reduced-motion: reduce){.arf-spin{animation:none}}" +
        // ---- saying something is wrong, in the theme's own colours ----
        // Lumiverse has a danger and a success colour and this had been using
        // neither, so a warning read as another muted paragraph. Tinted background,
        // matching edge, text left at full strength so the colour is the signal and
        // not the thing you have to read through.
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
        ".arf-box{width:22px;height:22px}" +
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
        return b;
    }
    const rule = () => el("div", "arf-rule");
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
    // The sections that stay folded, remembered while the page is open so they do
    // not close themselves every time the tab repaints.
    let costOpen = false;
    let shapeOpen = false;
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
                if (contrastRatio(shown, back) < TEXT_FLOOR) {
                    const ink = betterInk(back);
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
        head.appendChild(el("span", "arf-caret", open ? CARET_OPEN : CARET_SHUT));
        head.appendChild(el("span", "arf-grow", title));
        head.addEventListener("click", () => {
            if (openFolds.has(title))
                openFolds.delete(title);
            else
                openFolds.add(title);
            paint();
        });
        wrap.appendChild(head);
        if (open) {
            const body = el("div", "arf-foldbody");
            fill(body);
            wrap.appendChild(body);
        }
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
    function matches(c) {
        const want = hunt.trim().toLowerCase();
        if (!want)
            return true;
        try {
            return String(c.textContent || "").toLowerCase().indexOf(want) >= 0;
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
            return [buildConnectionCard(), buildSamplerCard()];
        if (id === "limits")
            return [buildProtectCard(), buildGuardCard(), buildSafetyCard()];
        if (id === "log") {
            const out = [buildLiveCard()];
            const watch = buildWatchCard();
            if (watch)
                out.push(watch);
            const notes = buildNotesCard();
            if (notes)
                out.push(notes);
            out.push(buildActivityCard(), buildDebugCard());
            return out;
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
    function putBack(held) {
        for (const one of held) {
            try {
                if (one.node && one.node.scrollTo && one.node === globalThis)
                    one.node.scrollTo(0, one.at);
                else if (one.node)
                    one.node.scrollTop = one.at;
            }
            catch (_) { }
        }
    }
    function paint() {
        // The buttons on the messages show the same state this panel does, so they
        // are refreshed with it rather than on a timer of their own.
        if (cfg.msgButton && cfg.enabled)
            sweepMsgButtons();
        // And the floating button, which used to be painted only by the live clock.
        // That clock runs while a refine is running, so walking out to the home
        // screen left the button sitting there looking ready to refine something
        // that was no longer on the page.
        paintFloat();
        if (!tab || !tab.root)
            return;
        const root = tab.root;
        // Where you were reading. The panel is rebuilt from nothing on every
        // repaint, which resets the scroll to the top, so saving a preset from the
        // bottom of a long tab threw you back to the switch. Held and put back.
        const held = scrollers(root);
        // The rule boxes are rebuilt with everything else, so a repaint while
        // somebody is typing would take the cursor with it. Held and put back.
        const focusKey = document.activeElement?.getAttribute?.("data-arf-field");
        const caret = document.activeElement?.selectionStart;
        root.innerHTML = "";
        root.className = "arf";
        liveEls = null;
        liveWatch = null;
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
        // Colours only resolve once the tree is in the page and laid out, so the
        // repair runs a frame later rather than against a half-built panel. The
        // scroll is set again there and once more after: a panel that grew taller
        // between the frames would have clamped the earlier attempts to its old
        // height, which is what left this looking unfixed.
        try {
            requestAnimationFrame(() => {
                sweepReadable(root);
                putBack(held);
                requestAnimationFrame(() => putBack(held));
            });
        }
        catch (_) {
            sweepReadable(root);
            putBack(held);
        }
        if (focusKey) {
            const back = root.querySelector('[data-arf-field="' + focusKey + '"]');
            if (back && typeof back.focus === "function") {
                back.focus();
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
        const wrap = card();
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
            paint();
        });
        top.appendChild(mark);
        top.appendChild(name);
        top.appendChild(sw);
        wrap.appendChild(top);
        const st = statusLine();
        const line = el("div", "arf-row arf-note");
        const dot = el("span", "arf-dot" + (st.tone === "off" ? "" : st.tone === "busy" ? " arf-busy" : " arf-live"));
        const words = el("span", "", st.text);
        line.appendChild(dot);
        line.appendChild(words);
        wrap.appendChild(line);
        // Held so the running clock can be written straight into it. Repainting the
        // whole panel once a second to move one number would close every open
        // select and lose the caret in whatever box was being typed in.
        liveEls = { dot: dot, text: words };
        const row = el("div", "arf-row");
        const stop = whyNot();
        const now = button("Refine the latest reply", true);
        now.disabled = busy || !!stop;
        now.style.opacity = now.disabled ? "0.5" : "1";
        now.style.cursor = now.disabled ? "not-allowed" : "pointer";
        if (stop)
            now.title = stop;
        now.addEventListener("click", () => refineNow());
        row.appendChild(now);
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
            paint();
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
    function buildUndoRow(one) {
        const box = el("div", "arf-col");
        const pane = (title, text, dim) => {
            box.appendChild(el("div", "arf-note", title));
            box.appendChild(el("div", "arf-well arf-scroll" + (dim ? " arf-dim" : ""), text));
        };
        pane("Before", one.before, true);
        pane("After", one.after, false);
        const row = el("div", "arf-row");
        const back = button("Put it back", false);
        back.addEventListener("click", () => {
            send({
                type: "undo_refine",
                requestId: newId(),
                chatId: one.chatId,
                messageId: one.messageId,
            });
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
    function textBox(key, label, hint, rows) {
        const wrap = el("div", "arf-col");
        wrap.appendChild(el("div", "arf-lab", label));
        const ta = document.createElement("textarea");
        ta.rows = rows;
        ta.value = String(cfg[key] == null ? "" : cfg[key]);
        ta.setAttribute("data-arf-field", key);
        ta.setAttribute("aria-label", label);
        ta.className = "arf-field";
        ta.addEventListener("input", () => {
            cfg[key] = ta.value;
            persist();
        });
        // Written at once on the way out, so wandering off mid-sentence keeps it.
        ta.addEventListener("blur", () => {
            cfg[key] = ta.value;
            persist(true);
            paint();
        });
        wrap.appendChild(ta);
        wrap.appendChild(note(hint));
        return wrap;
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
            tryBusy = true;
            tryResult = null;
            persist(true);
            const id = newId();
            tryWaiting = id;
            send({ type: "try_refine", requestId: id, text: text, asUser: false });
            paint();
        });
        row.appendChild(grab);
        row.appendChild(go);
        wrap.appendChild(row);
        if (tryBusy)
            wrap.appendChild(note("Working..."));
        else if (tryResult)
            wrap.appendChild(el("div", "arf-well arf-scroll" + (tryResult.ok ? "" : " arf-dim"), tryResult.text));
        return wrap;
    }
    let tryWaiting = null;
    // The settings other rows hang off. Changing one of these rebuilds the panel
    // rather than only saving it, or its children stay on screen after the thing
    // they belong to has been switched off.
    //
    // Read off the rows themselves rather than kept as a list by hand. The hand
    // written version was wrong within a day of being written: a new setting with
    // children was added, its parent was not added here, and its children sat
    // there doing nothing. A list that has to be maintained alongside the thing it
    // describes is a list that drifts.
    const PARENTS = (() => {
        const out = ["thinkingMode"];
        for (const list of [GUARD_FIELDS, WIDGET_FIELDS, COST_FIELDS, LIMIT_FIELDS])
            for (const f of list)
                if (f.needs && out.indexOf(f.needs.key) < 0)
                    out.push(f.needs.key);
        return out;
    })();
    const hasChildren = (key) => PARENTS.indexOf(key) >= 0;
    // Whether a row has anything to do where it sits.
    function fieldShows(f) {
        if (!f.needs)
            return true;
        const held = cfg[f.needs.key];
        return f.needs.is === undefined ? !!held : held === f.needs.is;
    }
    function fieldRow(f) {
        const wrap = el("div", "arf-col" + (f.under ? " arf-under" : ""));
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
                // Rows hang off this one, so they have to go and come back with it
                // rather than sit there doing nothing until the next repaint.
                if (hasChildren(f.key))
                    paint();
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
                ? [{ value: "", label: "The model I am chatting with" }].concat(connections.map((c) => ({
                    value: c.id,
                    label: (c.name || c.provider || "Connection") +
                        (c.model ? " (" + c.model + ")" : "") +
                        (c.isDefault ? " - default" : ""),
                })))
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
                if (hasChildren(f.key))
                    paint();
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
    function buildBlocksCard() {
        const list = blockList();
        const on = list.filter((b) => b.on).length;
        const wrap = card("Your prompt", "The refine is one request, and this is it. Blocks are sent top to bottom, and two next to each other with the same role are joined into one message. A block that comes out empty is left out.", on + " of " + list.length + " on");
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
        if (!holdsTurn(list))
            wrap.appendChild(bad("No block has " +
                TURN_MACRO +
                " in it, so the model would never see the message it is meant to rewrite. Nothing here will be refined until one does."));
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
            setBlocks(next);
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
    // What a block can say, and who answers it. Worth having on screen rather
    // than in a document: the whole point of the block editor is writing these,
    // and a macro you cannot remember the name of is a macro you do not use.
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
        for (const f of COST_FIELDS) {
            if (!fieldShows(f))
                continue;
            wrap.appendChild(fieldRow(f));
        }
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
            hint: "On by default. Tags, code and image links are lifted out and stood in for while the model works, then put back exactly as they were. If one does not come back, the rewrite is dropped: asking a model to preserve something and checking that it did are different things.",
        }));
        if (cfg.protectOn)
            wrap.appendChild(fieldRow({
                key: "protectInline",
                label: "Hide plain italic and bold too",
                type: "bool",
                hint: "Off by default. Tags like <i> and <b> wrap words in the middle of a sentence, and hiding them hands the model a sentence with holes in it, which makes the rewrite worse to protect something it was unlikely to break. They stay visible and the prompt tells it to leave them alone. Anything carrying an attribute, like a colour, is hidden either way.",
            }));
        wrap.appendChild(fieldRow({
            key: "wrapOutput",
            label: "Take the answer from between the tags",
            type: "bool",
            hint: "On by default. This is the reading rule, not the asking: when the answer carries <REFINED> and </REFINED>, only what is between them is saved, and an opening tag with nothing closing it means the rewrite was cut off and is dropped rather than saved half written. Asking for the tags is your prompt's job. The one that ships with it asks in the How to answer block, in plain words you can reword, move or delete. Off, the whole answer is taken as the rewrite.",
        }));
        wrap.appendChild(fieldRow({
            key: "streamProgress",
            label: "Watch the rewrite arrive",
            type: "bool",
            hint: "On by default. Streams the refine so the panel can say what it is doing and how much has come back. The answer is judged when it is complete either way, so this changes nothing about what gets saved. A connection that cannot stream falls back on its own.",
        }));
        wrap.appendChild(fieldRow({
            key: "watchLive",
            label: "Show me the words as they arrive",
            type: "bool",
            needs: { key: "streamProgress" },
            under: true,
            hint: "Off by default. Puts a Watch it happen card on the Log tab that fills in as the model writes, instead of only counting characters. On a reasoning prompt you see it work the edit out first and then write it, because the working comes back before the rewrite. It costs a little traffic between the panel and the server on every refine, which is why it is something to switch on when you want to watch one, not something to leave on.",
        }));
        wrap.appendChild(fieldRow({
            key: "protectThinking",
            label: "Never send the model's thinking",
            type: "bool",
            hint: "On by default. A reasoning model's working is not your writing, and a rewrite of it would sit in a place nobody looks. It is cut off before the refine and put back after.",
        }));
        wrap.appendChild(fieldRow({
            key: "thinkTags",
            label: "Extra thinking tag names",
            type: "lines",
            needs: { key: "protectThinking" },
            under: true,
            hint: "Optional, one per line. The common ones are already handled: think, thinking, thought, thoughts, reasoning, reflection, scratchpad and analysis. Add a name only if your model wraps its working in an unusual one. Just the name, with no brackets or pipes, and a name you add is recognised in all four wrappers. This is worth getting right: working that is not recognised is handed to the refiner as if it were your prose, rewritten, and saved over the reply.",
        }));
        if (!cfg.protectOn)
            wrap.appendChild(warn("With this off, a rewrite can quietly change or drop any formatting in your replies."));
        return wrap;
    }
    function buildGuardCard() {
        const wrap = card("What it refuses to save", "A model asked to rewrite prose sometimes answers with something else. A rewrite that fails one of these is dropped and the reply is left exactly as it was, and the Log says which one fired. Each is yours to switch off.");
        for (const f of LIMIT_FIELDS.filter((f) => f.key === "maxGrowthPct" || f.key === "minShrinkPct"))
            wrap.appendChild(fieldRow(f));
        for (const f of GUARD_FIELDS)
            if (fieldShows(f))
                wrap.appendChild(fieldRow(f));
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
    // ---- Log ----
    // What the model wrote around the <REFINED> tags on the last pass. Nothing
    // outside those tags is ever saved into a chat, which is what makes it a safe
    // place for a prompt to ask for a report: what was cut, what was added, what
    // was left alone on purpose. Kept here so the report has somewhere to be
    // read instead of being dropped on the floor.
    let lastNotes = "";
    let lastNotesAt = 0;
    // ---- watching one arrive ----
    // The rewrite as it is being written. Held here rather than in the log,
    // because it is replaced several times a second and is gone the moment the
    // refine lands.
    let live = "";
    // Which try is running, for the line that says so.
    let retryAt = 0;
    let retryOf = 0;
    // Written straight into the element rather than through paint(). A repaint
    // five times a second would rebuild the whole panel under whoever is reading
    // it, take the scroll with it, and drop focus from anything they were typing
    // in. This is the same reason the status line writes itself in place.
    function showLive(text) {
        live = text;
        try {
            if (!liveWatch) {
                paint();
                return;
            }
            const parts = splitLive(text);
            liveWatch.notes.textContent = parts.notes;
            liveWatch.notesWrap.hidden = !parts.notes;
            liveWatch.out.textContent = parts.body;
            liveWatch.outWrap.hidden = !parts.body;
            // Following the newest line, the way a terminal does.
            liveWatch.notes.scrollTop = liveWatch.notes.scrollHeight;
            liveWatch.out.scrollTop = liveWatch.out.scrollHeight;
        }
        catch (_) { }
    }
    let liveWatch = null;
    // What has arrived so far, split into the two things a reasoning prompt asks
    // for. Written to work on half a tag: this runs on text that is still being
    // written, so every opener may have no closer yet.
    function splitLive(text) {
        const t = String(text || "");
        let notes = "";
        let body = "";
        const nOpen = /<\s*refine_notes\s*>/i.exec(t);
        if (nOpen) {
            const rest = t.slice(nOpen.index + nOpen[0].length);
            const nClose = /<\s*\/\s*refine_notes\s*>/i.exec(rest);
            notes = nClose ? rest.slice(0, nClose.index) : rest;
        }
        const bOpen = /<\s*refined\s*>/i.exec(t);
        if (bOpen) {
            const rest = t.slice(bOpen.index + bOpen[0].length);
            const bClose = /<\s*\/\s*refined\s*>/i.exec(rest);
            body = bClose ? rest.slice(0, bClose.index) : rest;
        }
        else if (!nOpen) {
            // No tags yet, or a prompt that does not use them. Whatever is there is
            // the rewrite as far as anybody watching is concerned.
            body = t;
        }
        return { notes: notes.trim(), body: body.trim() };
    }
    function buildWatchCard() {
        if (!cfg.watchLive || !cfg.streamProgress)
            return null;
        const running = busy || msgBusy !== null;
        if (!running && !live)
            return null;
        const wrap = card("Watch it happen", undefined, running ? "live" : "finished");
        const parts = splitLive(live);
        const notesWrap = el("div", "arf-col");
        notesWrap.appendChild(el("div", "arf-lab", "What it is working out"));
        const notes = el("div", "arf-well arf-mono arf-scroll", parts.notes);
        notesWrap.appendChild(notes);
        notesWrap.hidden = !parts.notes;
        wrap.appendChild(notesWrap);
        const outWrap = el("div", "arf-col");
        outWrap.appendChild(el("div", "arf-lab", "The rewrite, as it is written"));
        const out = el("div", "arf-well arf-mono arf-scroll", parts.body);
        outWrap.appendChild(out);
        outWrap.hidden = !parts.body;
        wrap.appendChild(outWrap);
        if (!parts.notes && !parts.body)
            wrap.appendChild(note("Waiting for the first words to come back."));
        liveWatch = { notes: notes, notesWrap: notesWrap, out: out, outWrap: outWrap };
        return wrap;
    }
    function takeNotes(msg) {
        try {
            const t = String((msg && msg.notes) || "").trim();
            if (!t)
                return;
            lastNotes = t.length > 8000 ? t.slice(0, 8000) + "\u2026" : t;
            lastNotesAt = Date.now();
            log("the model sent a note back with the refine", true);
        }
        catch (_) { }
    }
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
    // Only there when there is something to show. A prompt that never asks for a
    // report should not carry an empty card about one.
    function buildNotesCard() {
        if (!lastNotes)
            return null;
        const wrap = card("What it said about the edit", "Whatever the model wrote outside the <REFINED> tags on the last pass. None of it was saved into your chat. The two reasoning prompts ask for working here, between <REFINE_NOTES> tags; on the other two this stays empty until you ask for something in the How to answer block.", new Date(lastNotesAt).toTimeString().slice(0, 5));
        const box = el("div", "arf-well arf-mono", lastNotes);
        wrap.appendChild(box);
        const row = el("div", "arf-row");
        const copy = button("Copy", false);
        copy.addEventListener("click", () => {
            copyText(lastNotes);
            toast("Copied.", true);
        });
        const big = button("Expand", false);
        big.addEventListener("click", () => openBig("What it said about the edit", lastNotes));
        const clear = button("Clear", false);
        clear.addEventListener("click", () => {
            lastNotes = "";
            lastNotesAt = 0;
            paint();
        });
        row.appendChild(copy);
        row.appendChild(big);
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
                cfg.timeoutSecs +
                "s");
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
            lines.push("message button: " +
                (cfg.msgButton ? "on" : "off") +
                ", widget: " +
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
            key: "toast",
            label: "Show a pop-up",
            type: "bool",
            hint: "On by default. Turn it off if you would rather it worked quietly and you watched this tab instead.",
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
            hint: "A small round button over the chat that refines the latest reply in one tap, and can be dragged where you want it. Hold it, or right click it, for a menu with the tab, the automatic pass, the per chat switch and a way to hide it again. While it is on screen its menu also holds anything that would otherwise be a row in the chat input's Extras menu. Needs the interface panels permission.",
        }));
        if (cfg.widgetOn && widgetFailed)
            wrap.appendChild(bad("The floating button could not be created. Check that the interface panels permission is granted."));
        // Its own settings, which only exist while it does.
        if (cfg.widgetOn)
            for (const f of WIDGET_FIELDS)
                wrap.appendChild(fieldRow(f));
        wrap.appendChild(fieldRow({
            key: "msgButton",
            label: "A button on every message",
            type: "bool",
            hint: "Puts a refine button in each message's own row of actions, next to Edit and Copy. After a refine the same button becomes an undo, so putting one back is where you are already looking.",
        }));
        wrap.appendChild(fieldRow({
            key: "inputRefine",
            label: "Refine what I am typing",
            type: "bool",
            hint: "Rewrites the text sitting in your input box, before you send it. It changes the box you are typing in, so it is off until you ask for it. It lives in one place at a time: while the floating button is on screen this is in that button's menu, and it is a row in the chat input's Extras menu only when there is no button to hold it.",
        }));
        if (cfg.inputRefine || cfg.msgButton)
            wrap.appendChild(note("These two reach into the page rather than going through an API, because Lumiverse does not offer one for the message row or the input box. They are the only parts of this extension that depend on how Lumiverse is laid out. If an update ever moves either, these stop working and nothing else does."));
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
                    paint();
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
    const INPUT_PICKS = [
        'textarea[data-component="ChatInput"]',
        '[data-component="ChatInput"] textarea',
        '[data-component="InputBar"] textarea',
        'form textarea',
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
        if (inputWaiting)
            return;
        inputNode = node;
        const id = newId();
        inputWaiting = id;
        log("refining what you are typing");
        // The same path the Try it box uses: nothing is saved to the chat, the
        // answer comes back and this puts it in the box. asUser is what tells the
        // model it is looking at the player's own voice.
        send({ type: "try_refine", requestId: id, text: text, asUser: true });
    }
    // ---- a button on each message ----
    // Lumiverse has no API for adding one yet, so this finds the action row and
    // puts a button in it. That makes it the second thing in the extension that
    // depends on the page's shape, and it is off until asked for.
    //
    // Rather than matching a CSS module class, which changes on every build, this
    // looks for the message wrapper by its data attribute and then for the action
    // bar by the one button that has always been in it. If a Lumiverse update
    // moves either, this quietly does nothing instead of throwing on every render.
    const MSG_SEL = "[data-message-id]";
    let msgWatch = null;
    function actionBarIn(msg) {
        const named = msg.querySelector('[data-component="BubbleActions"]');
        if (named)
            return named;
        // Every layout has an Edit button, and it sits in the row we want.
        const edit = msg.querySelector('button[title="Edit"]');
        return edit && edit.parentElement ? edit.parentElement : null;
    }
    function messageIdOf(msg) {
        try {
            return String(msg.getAttribute("data-message-id") || "");
        }
        catch (_) {
            return "";
        }
    }
    // Whether this message has something to put back, which decides whether the
    // button refines or undoes.
    function undoableHere(id) {
        if (lastChatId == null)
            return false;
        return undoable.has(undoKey(lastChatId, id));
    }
    // Only touches the button when it would actually say something different.
    //
    // This is not a tidiness point. Painting rewrites innerHTML, which is a
    // childList change, and this runs from an observer watching the whole body
    // for childList changes. Repainting a button that already said the right
    // thing scheduled another sweep, which repainted it again: the tab locked up
    // the moment the setting was switched on.
    function paintMsgBtn(btn, id) {
        const busyHere = msgBusy === id;
        const back = undoableHere(id);
        const state = busyHere ? "busy" : back ? "back" : "ready";
        if (btn.getAttribute("data-arf-state") === state)
            return;
        btn.setAttribute("data-arf-state", state);
        btn.innerHTML = busyHere ? spinIcon() : back ? undoIcon() : refineIcon();
        btn.title = busyHere ? "Refining" : back ? "Put this message back" : "Refine this message";
        btn.setAttribute("aria-label", btn.title);
        btn.disabled = busyHere;
        btn.style.opacity = busyHere ? "0.6" : "1";
    }
    let msgBusy = null;
    function addMsgButton(msg) {
        try {
            if (!cfg.msgButton || !cfg.enabled)
                return;
            const id = messageIdOf(msg);
            if (!id)
                return;
            // Still streaming: the action row is not there yet, and a later pass
            // catches it.
            const part = msg.getAttribute("data-part");
            if (part === "streaming")
                return;
            const bar = actionBarIn(msg);
            if (!bar)
                return;
            const had = bar.querySelector("[data-arf-msg]");
            if (had) {
                paintMsgBtn(had, id);
                return;
            }
            const b = document.createElement("button");
            b.type = "button";
            b.setAttribute("data-arf-msg", id);
            b.className = "arf-msgbtn";
            paintMsgBtn(b, id);
            b.addEventListener("click", (e) => {
                try {
                    e.preventDefault();
                    e.stopPropagation();
                }
                catch (_) { }
                if (undoableHere(id)) {
                    send({ type: "undo_refine", requestId: newId(), chatId: lastChatId, messageId: id });
                    return;
                }
                const why = whyNot();
                if (why) {
                    toast(why, true);
                    return;
                }
                msgBusy = id;
                markBusy(true);
                sweepMsgButtons();
                paint();
                send({ type: "refine_now", requestId: newId(), chatId: lastChatId, messageId: id });
            });
            bar.appendChild(b);
        }
        catch (_) { }
    }
    function sweepMsgButtons() {
        try {
            const all = document.querySelectorAll(MSG_SEL);
            for (let i = 0; i < all.length; i++)
                addMsgButton(all[i]);
        }
        catch (_) { }
    }
    function dropMsgButtons() {
        try {
            const all = document.querySelectorAll("[data-arf-msg]");
            for (let i = 0; i < all.length; i++)
                all[i].remove();
        }
        catch (_) { }
    }
    function watchMessages(on) {
        if (!on) {
            if (msgWatch) {
                try {
                    msgWatch.disconnect();
                }
                catch (_) { }
                msgWatch = null;
            }
            dropMsgButtons();
            return;
        }
        if (msgWatch) {
            sweepMsgButtons();
            return;
        }
        try {
            msgWatch = new MutationObserver(() => sweepMsgButtons());
            msgWatch.observe(document.body, {
                childList: true,
                subtree: true,
                // A message is staged before it streams and the same element flips
                // data-part when streaming ends, with no child change to notice.
                attributes: true,
                attributeFilter: ["data-part"],
            });
            sweepMsgButtons();
        }
        catch (_) {
            msgWatch = null;
        }
    }
    disposers.push(() => watchMessages(false));
    // ---- the floating button and the input bar row ----
    let widget = null;
    let inputAction = null;
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
            // The hold used to be armed on pointerdown and disarmed on the button's
            // own pointerup, and the host captures the pointer to drag the widget, so
            // that pointerup never arrived. Every tap became a hold, and the click
            // that followed was swallowed by a flag nothing ever cleared: the button
            // did nothing at all. Now the disarm listens on the window, in the
            // capture phase, where a captured pointer still reports, and a drag of
            // more than a few pixels cancels it as well.
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
                // Held against this button rather than the session. The button is
                // rebuilt every time its size changes and every time it is switched off
                // and on, and these used to be dropped only at teardown: three more
                // window listeners per rebuild, each holding a button that is no longer
                // on screen, all of them running on every pointermove across the page.
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
        // spinner: tapping the spinner to call it off is the thing anybody would
        // try first, and it used to start a second refine on top of the first.
        if (busy || msgBusy !== null) {
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
        if (cfg.widgetUndo && undoHere().length) {
            const one = undoHere()[0];
            send({
                type: "undo_refine",
                requestId: newId(),
                chatId: one.chatId,
                messageId: one.messageId,
            });
            return;
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
            const back = cfg.widgetUndo && undoHere().length > 0;
            const working = busy || msgBusy !== null;
            // Why a tap would do nothing, when that is the answer. On the home screen
            // there is no chat to refine, and the button was still drawn ready for
            // one: the tap explained itself in a toast, but only after you had
            // pressed a button that looked willing.
            const stuck = working || back ? "" : whyNot();
            el2.innerHTML = working ? spinIcon() : back ? undoIcon() : refineIcon();
            // The icons are written at a fixed 20px, which is most of a 28px button
            // and lost inside a 96px one. Just over half the button leaves the ring
            // around it looking even at either end of the range.
            const svg = el2.querySelector && el2.querySelector("svg");
            if (svg) {
                const mark = String(Math.round(widgetWanted() * 0.52));
                svg.setAttribute("width", mark);
                svg.setAttribute("height", mark);
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
        // Only what the button cannot already do, and nothing that is a setting.
        //
        // Refining the latest reply is not here because that is what a tap does,
        // and a menu entry for the thing the button already is reads as a second
        // button. The automatic pass and the per chat switch are not here because
        // they are settings: they belong on the tab with their explanations next to
        // them, not in a menu opened over the chat where the label is all you get.
        const items = [];
        // The panel first. It is what somebody holding the button is most likely
        // after, and everything taken out of this list is in it.
        // A refine holding for an answer comes before everything, because nothing
        // else is going to happen until it is settled.
        if (pending) {
            items.push({ key: "accept", label: "Accept the refine that is waiting" });
            items.push({ key: "decline", label: "Turn it down and keep the reply" });
        }
        items.push({ key: "open", label: "Open the Auto Refine tab" });
        // First while it is running, because it is the only thing anybody opens
        // this menu for mid-refine and the reason they are in a hurry.
        if (busy || msgBusy !== null)
            items.push({ key: "stop", label: "Stop this refine" });
        if (undoHere().length)
            items.push({ key: "undo", label: "Put the last refine back" });
        // On the same terms as the panel entry: its setting puts it in the Extras
        // menu, and this menu takes it over while the button is on screen.
        if (cfg.inputRefine)
            items.push({ key: "draft", label: "Refine what I am typing" });
        // Last, under everything else, because these two are the only entries that
        // take the button off the screen.
        items.push({ key: "hide", label: "Hide this button" });
        items.push({ key: "off", label: "Turn Auto Refine off" });
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
        else if (picked === "undo") {
            const one = undoHere()[0];
            if (one)
                send({ type: "undo_refine", requestId: newId(), chatId: one.chatId, messageId: one.messageId });
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
        // The button on each message.
        watchMessages(!!cfg.msgButton && !!cfg.enabled);
        // The Extras row that refines what you are typing.
        //
        // In one place at a time. While the floating button is on screen its menu
        // holds this, and the Extras menu holds it only when there is no button to.
        // Two ways to reach one thing is one more than anybody needs, and it
        // clutters a menu that was opened for something else. With the button off,
        // or refused because ui_panels was not granted, Extras is the only way to
        // reach it on a phone, so it comes back.
        const want = !!cfg.inputRefine && !!cfg.enabled && !widgetCarriesEntries();
        if (want && !inputAction) {
            try {
                if (ctx.ui && typeof ctx.ui.registerInputBarAction === "function") {
                    inputAction = ctx.ui.registerInputBarAction({
                        id: "auto-refine-input",
                        label: "Refine what I am typing",
                        iconSvg: refineIcon(),
                    });
                    if (inputAction && typeof inputAction.onClick === "function")
                        inputAction.onClick(() => refineInput());
                }
            }
            catch (_) {
                inputAction = null;
            }
        }
        else if (!want && inputAction) {
            try {
                inputAction.destroy && inputAction.destroy();
            }
            catch (_) { }
            inputAction = null;
        }
    }
    disposers.push(() => {
        dropWidget();
        try {
            inputAction && inputAction.destroy && inputAction.destroy();
        }
        catch (_) { }
        inputAction = null;
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
    function cancelRefine() {
        if (!busy && msgBusy === null)
            return;
        send({ type: "cancel_refine", requestId: newId() });
        log("asked it to stop");
    }
    // A new refine starts on an empty screen rather than under the last one.
    function clearLive() {
        live = "";
        liveWatch = null;
    }
    function refineNow() {
        // Pressing refine while one is already running used to queue a second
        // against the same reply, and whichever finished last won. One at a time.
        if (busy || msgBusy !== null) {
            toast("A refine is already running. Press it again to stop that one.", true);
            return;
        }
        const why = whyNot();
        if (why) {
            toast(why, true);
            log("nothing to refine: " + why.toLowerCase().replace(/\.$/, ""));
            return;
        }
        clearLive();
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
                        if (msg.stage === "writing" && typeof msg.chars === "number")
                            streamed = msg.chars;
                        if (typeof msg.text === "string" && msg.text)
                            showLive(msg.text);
                        if (msg.stage === "retrying") {
                            retryAt = Number(msg.attempt) || 0;
                            retryOf = Number(msg.of) || 0;
                            // A new answer is coming, so the last one stops being the thing
                            // on screen.
                            clearLive();
                            log("an answer failed a check, asking again");
                        }
                        markBusy(true, msg.stage);
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
                        if (msg.resolved && !msg.chatId) {
                            // It could look, and there is nothing open. The home screen, or a
                            // character page with no chat started yet.
                            leftTheChat();
                            return;
                        }
                        if (msg.chatId) {
                            // A chat the address bar has already moved on from is a stale
                            // answer, not news.
                            if (urlNamesChats && !urlHolds(msg.chatId))
                                return;
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
                        paint();
                        return;
                    }
                    if (msg.type === "connections") {
                        connections = Array.isArray(msg.list) ? msg.list : [];
                        paint();
                        return;
                    }
                    if (msg.type === "refined") {
                        markBusy(false);
                        msgBusy = null;
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
                    if (msg.type === "account_save_failed") {
                        // Settings that look saved and are not is the worst shape this can
                        // take, so it is said plainly rather than logged quietly.
                        const what = String(msg.what || "settings");
                        log("your " + what + " could not be saved to your account. They are still saved in this browser.");
                        toast("Could not save your " + what + " to your account. They are saved in this browser only.", true);
                        paint();
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
                        msgBusy = null;
                        paint();
                        return;
                    }
                    if (msg.type === "refine_notes") {
                        takeNotes(msg);
                        paint();
                        return;
                    }
                    if (msg.type === "refine_skipped") {
                        takeNotes(msg);
                        markBusy(false);
                        msgBusy = null;
                        const why = String(msg.why || "no reason given");
                        tally.dropped++;
                        countDrop(why);
                        lastRun = { ms: lastRunMs, ok: false, why: why };
                        log("left a reply alone: " + why);
                        paint();
                        return;
                    }
                    if (msg.type === "refine_result") {
                        takeNotes(msg);
                        markBusy(false);
                        msgBusy = null;
                        previewBusy = false;
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
                        tryBusy = false;
                        tryWaiting = null;
                        inputWaiting = null;
                        tryResult = { ok: false, text: String(msg.why || "It could not be run.") };
                        paint();
                        return;
                    }
                    if (msg.type === "try_result") {
                        // The input bar and the Try it box use the same request, so the
                        // waiting id is what says where the answer goes.
                        if (inputWaiting === msg.requestId) {
                            inputWaiting = null;
                            const node = inputNode || composer();
                            inputNode = null;
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
                        takeNotes(msg);
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
                        if (msg.ok) {
                            if (msg.messageId != null)
                                undoable.delete(undoKey(msg.chatId, msg.messageId));
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
                        pending = {
                            chatId: msg.chatId,
                            messageId: msg.messageId,
                            before: String(msg.before || ""),
                            after: String(msg.after || ""),
                            at: Date.now(),
                        };
                        markBusy(false);
                        msgBusy = null;
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
    askActiveChat();
    askPermissions();
    // After armBackend, so the replies have somewhere to land. Both are
    // fire and forget: the panel is already drawn from the browser's cache, and
    // the account copy repaints it when it arrives.
    loadFromAccount();
    loadPresetsFromAccount();
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
    FILL_FLOOR,
};
