/* =========================================================
   themes.js — 배경/글자 색상 팔레트 정의
   각 테마는 renderer.js 가 그대로 사용하는 색상 토큰 모음이다.
   bg 는 단색 문자열 또는 { from, to, angle } 형태의 그라디언트.
   ========================================================= */
(function (global) {
  'use strict';

  var THEMES = {
    ivory: {
      label: '아이보리',
      bg: { from: '#F7F3EA', to: '#EFE7D8', angle: 135 },
      ink: '#2E2A26',
      sub: '#8A8177',
      line: '#D8CEBC',
      accent: '#C0724A',
      sunday: '#C4553F',
      saturday: '#5C7FA3',
      todayBg: '#C0724A',
      todayInk: '#FFFFFF',
      swatch: '#F2ECE0'
    },
    charcoal: {
      label: '차콜',
      bg: { from: '#1E1F22', to: '#141517', angle: 135 },
      ink: '#EDEDED',
      sub: '#8B8D93',
      line: '#33353A',
      accent: '#E0A458',
      sunday: '#E0796B',
      saturday: '#7FA8D9',
      todayBg: '#E0A458',
      todayInk: '#1E1F22',
      swatch: '#1E1F22'
    },
    midnight: {
      label: '미드나잇',
      bg: { from: '#16203A', to: '#0B1020', angle: 160 },
      ink: '#E9EDF7',
      sub: '#8794B3',
      line: '#2A3557',
      accent: '#8FB8FF',
      sunday: '#FF8E8E',
      saturday: '#8FB8FF',
      todayBg: '#8FB8FF',
      todayInk: '#0B1020',
      swatch: '#16203A'
    },
    sage: {
      label: '세이지',
      bg: { from: '#E8EDE5', to: '#D5DED0', angle: 135 },
      ink: '#2C332B',
      sub: '#7C8A78',
      line: '#C0CCBA',
      accent: '#5E7C55',
      sunday: '#B4614F',
      saturday: '#5A7B93',
      todayBg: '#5E7C55',
      todayInk: '#FFFFFF',
      swatch: '#DDE5D8'
    },
    blush: {
      label: '블러쉬',
      bg: { from: '#FBF0EE', to: '#F3DFDC', angle: 135 },
      ink: '#3B2E2C',
      sub: '#A08984',
      line: '#E6CFCA',
      accent: '#C2766B',
      sunday: '#C2766B',
      saturday: '#8093AE',
      todayBg: '#C2766B',
      todayInk: '#FFFFFF',
      swatch: '#F7E6E2'
    },
    mono: {
      label: '모노 화이트',
      bg: '#FFFFFF',
      ink: '#111111',
      sub: '#9A9A9A',
      line: '#E2E2E2',
      accent: '#111111',
      sunday: '#111111',
      saturday: '#111111',
      todayBg: '#111111',
      todayInk: '#FFFFFF',
      swatch: '#FFFFFF'
    },
    forest: {
      label: '포레스트',
      bg: { from: '#1B2B24', to: '#0E1713', angle: 150 },
      ink: '#E6EFE8',
      sub: '#849287',
      line: '#2C4038',
      accent: '#9BC7A4',
      sunday: '#E39A8E',
      saturday: '#93B8CE',
      todayBg: '#9BC7A4',
      todayInk: '#0E1713',
      swatch: '#1B2B24'
    }
  };

  global.CalendarThemes = THEMES;
})(window);
