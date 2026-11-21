import { Mission } from '../types/mission';
import { MISSIONS_PART1 } from './missions/part1Basics';
import { MISSIONS_PART2 } from './missions/part2ProBasics';
import { MISSIONS_PART3 } from './missions/part3Features';
import { MISSIONS_PART4 } from './missions/part4Advanced';
import { MISSIONS_PART5 } from './missions/part5Mastery';
import { MISSIONS_PART6 } from './missions/part6ModernNeovim';

export const MISSIONS: Mission[] = [
  ...MISSIONS_PART1,
  ...MISSIONS_PART2,
  ...MISSIONS_PART3,
  ...MISSIONS_PART4,
  ...MISSIONS_PART5,
  ...MISSIONS_PART6,
];
