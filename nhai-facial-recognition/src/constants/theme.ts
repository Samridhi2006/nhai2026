export const COLORS = {
  nhaiOrange: '#E8610A',
  nhaiOrangeDark: '#C2500A',
  nhaiGold: '#F5A623',
  nhaiNavy: '#0D1B3E',
  nhaiNavyLight: '#162850',
  bg: '#F0F2F5',
  card: '#FFFFFF',
  text: '#1A1F2E',
  muted: '#6B7280',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
};

export const GLOBAL_STYLES = {
  accentStrip: {
    height: 3,
    backgroundColor: COLORS.nhaiOrange,
    marginBottom: 16,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
};