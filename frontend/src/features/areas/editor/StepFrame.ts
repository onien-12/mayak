/** Header props every editor step passes to its `PanelLayout`. */
export interface StepFrame {
  title: string;
  subtitle?: string;
  onBack: () => void;
  backLabel: string;
}
