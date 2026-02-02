export const languageColors: { [key: string]: string } = {
    JavaScript: '#f1e05a',
    TypeScript: '#3178c6',
    Python: '#3572A5',
    Java: '#b07219',
    Kotlin: '#A97BFF',
    Swift: '#F05138',
    Go: '#00ADD8',
    Rust: '#dea584',
    'C++': '#f34b7d',
    C: '#555555',
    'C#': '#178600',
    Ruby: '#701516',
    PHP: '#4F5D95',
    Shell: '#89e051',
    Vue: '#41b883',
    Dart: '#00B4AB',
};

export const getLanguageColor = (lang: string) => {
    return languageColors[lang] || '#6e7681';
};

export const formatNumber = (num: number) => {
    if (!num) return '0';
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'm';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    return num.toString();
};
