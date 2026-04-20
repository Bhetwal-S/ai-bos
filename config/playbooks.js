// config/playbooks.js
// Built-in strategic playbooks with variable substitution

export const PLAYBOOKS = [
  {
    id: 'launch-saas',
    category: 'Product',
    icon: '🚀',
    title: 'Launch a SaaS Product',
    description: 'Full go-to-market plan: tech stack, hiring, infrastructure, marketing, legal, and budget.',
    template: 'Launch a {product_type} SaaS product targeting {target_market} in {timeframe}. Budget ceiling is {budget}.',
    variables: [
      { key: 'product_type',  label: 'Product Type',   placeholder: 'B2B HR management' },
      { key: 'target_market', label: 'Target Market',  placeholder: 'SMBs in the US' },
      { key: 'timeframe',     label: 'Timeframe',      placeholder: '90 days' },
      { key: 'budget',        label: 'Budget',         placeholder: '$50,000' },
    ],
  },
  {
    id: 'hire-team',
    category: 'People',
    icon: '👥',
    title: 'Hire a Founding Team',
    description: 'Roles, hiring timeline, onboarding plan, and reporting structure for your founding team.',
    template: 'Hire a founding {team_type} team of {headcount} people for a {stage} stage startup. Must be in place within {timeframe}.',
    variables: [
      { key: 'team_type',  label: 'Team Type',   placeholder: 'engineering' },
      { key: 'headcount',  label: 'Headcount',   placeholder: '5' },
      { key: 'stage',      label: 'Stage',       placeholder: 'seed' },
      { key: 'timeframe',  label: 'Timeframe',   placeholder: '60 days' },
    ],
  },
  {
    id: 'security-audit',
    category: 'Security',
    icon: '🔐',
    title: 'Security & Compliance Audit',
    description: 'Threat vectors, policy gaps, compliance flags (SOC2/GDPR), and an immediate action plan.',
    template: 'Run a full security and compliance audit for our {product_description}. We handle {data_type} data and are targeting {compliance_target} compliance.',
    variables: [
      { key: 'product_description', label: 'Product',          placeholder: 'API backend with user auth' },
      { key: 'data_type',           label: 'Data Handled',     placeholder: 'personal health records' },
      { key: 'compliance_target',   label: 'Compliance Target',placeholder: 'SOC2 Type II and GDPR' },
    ],
  },
  {
    id: 'fundraise-prep',
    category: 'Finance',
    icon: '💰',
    title: 'Fundraising Preparation',
    description: 'Financial model, valuation inputs, investor narrative, and legal structure for a funding round.',
    template: 'Prepare for a {round_type} fundraise of {amount}. Current ARR is {arr}, burn rate is {burn}/month. Target close in {timeframe}.',
    variables: [
      { key: 'round_type', label: 'Round',       placeholder: 'Series A' },
      { key: 'amount',     label: 'Target Raise',placeholder: '$3M' },
      { key: 'arr',        label: 'Current ARR', placeholder: '$400K' },
      { key: 'burn',       label: 'Burn Rate',   placeholder: '$45K' },
      { key: 'timeframe',  label: 'Timeline',    placeholder: '3 months' },
    ],
  },
  {
    id: 'product-launch-marketing',
    category: 'Marketing',
    icon: '📣',
    title: 'Product Launch Campaign',
    description: 'Channel mix, content cadence, positioning, budget allocation, and success metrics.',
    template: 'Plan a product launch marketing campaign for {product_name}, targeting {audience}. Launch date is {launch_date}. Marketing budget is {budget}.',
    variables: [
      { key: 'product_name', label: 'Product Name',  placeholder: 'HireFlow' },
      { key: 'audience',     label: 'Target Audience',placeholder: 'HR managers at mid-size companies' },
      { key: 'launch_date',  label: 'Launch Date',   placeholder: 'Q3 2025' },
      { key: 'budget',       label: 'Budget',        placeholder: '$15,000' },
    ],
  },
  {
    id: 'infra-scale',
    category: 'Infrastructure',
    icon: '⚙️',
    title: 'Scale Infrastructure',
    description: 'Cloud architecture, CI/CD pipeline, scaling strategy, and cost projection for growth.',
    template: 'Design infrastructure to scale from {current_users} to {target_users} users. Current stack is {current_stack}. Budget for infra is {budget}/month.',
    variables: [
      { key: 'current_users', label: 'Current Users', placeholder: '500' },
      { key: 'target_users',  label: 'Target Users',  placeholder: '50,000' },
      { key: 'current_stack', label: 'Current Stack', placeholder: 'Node.js on a single VPS' },
      { key: 'budget',        label: 'Infra Budget',  placeholder: '$3,000' },
    ],
  },
  {
    id: 'legal-entity',
    category: 'Legal',
    icon: '⚖️',
    title: 'Incorporate & Legal Setup',
    description: 'Entity type, jurisdiction, IP protection, founder agreements, and compliance requirements.',
    template: 'Help us incorporate and set up legal structure for a {business_type} startup in {jurisdiction}. We have {founder_count} founders and plan to raise funding.',
    variables: [
      { key: 'business_type',  label: 'Business Type', placeholder: 'B2B SaaS' },
      { key: 'jurisdiction',   label: 'Jurisdiction',  placeholder: 'Delaware, USA' },
      { key: 'founder_count',  label: 'Founders',      placeholder: '2' },
    ],
  },
];

export const CATEGORIES = ['All', 'Product', 'People', 'Security', 'Finance', 'Marketing', 'Infrastructure', 'Legal'];

export default PLAYBOOKS;
