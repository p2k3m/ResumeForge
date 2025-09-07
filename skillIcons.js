export const DEFAULT_SKILL_ICONS = {
  javascript: 'fa-brands fa-js',
  typescript: 'fa-solid fa-code',
  python: 'fa-brands fa-python',
  java: 'fa-brands fa-java',
  ruby: 'fa-regular fa-gem',
  php: 'fa-brands fa-php',
  html: 'fa-brands fa-html5',
  css: 'fa-brands fa-css3-alt',
  node: 'fa-brands fa-node-js',
  react: 'fa-brands fa-react',
  angular: 'fa-brands fa-angular',
  vue: 'fa-brands fa-vuejs',
  docker: 'fa-brands fa-docker',
  kubernetes: 'fa-solid fa-gears',
  aws: 'fa-brands fa-aws',
  git: 'fa-brands fa-git-alt',
  github: 'fa-brands fa-github',
  gitlab: 'fa-brands fa-gitlab',
  mysql: 'fa-solid fa-database',
  postgres: 'fa-solid fa-database',
  postgresql: 'fa-solid fa-database',
  mongodb: 'fa-solid fa-database',
  sql: 'fa-solid fa-database',
  linux: 'fa-brands fa-linux',
  c: 'fa-solid fa-code',
  'c++': 'fa-solid fa-code',
  cpp: 'fa-solid fa-code',
  'c#': 'fa-solid fa-code',
  csharp: 'fa-solid fa-code',
  go: 'fa-solid fa-code',
  golang: 'fa-solid fa-code',
  swift: 'fa-brands fa-swift',
  kotlin: 'fa-solid fa-code',
  android: 'fa-brands fa-android',
  ios: 'fa-brands fa-apple',
  wordpress: 'fa-brands fa-wordpress',
  bootstrap: 'fa-brands fa-bootstrap',
  graphql: 'fa-solid fa-share-nodes'
}

export const FALLBACK_SKILL_ICON = 'fa-solid fa-circle-question'

export const getSkillIcon = (skill = '') =>
  DEFAULT_SKILL_ICONS[skill.toLowerCase()] || FALLBACK_SKILL_ICON

export default DEFAULT_SKILL_ICONS
