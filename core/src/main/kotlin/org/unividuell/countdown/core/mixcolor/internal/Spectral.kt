// Ported from spectral.js 3.0.0, spectral.js
//
// MIT License
//
// Copyright (c) 2025 Ronald van Wijnen
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

package org.unividuell.countdown.core.mixcolor.internal

import kotlin.math.atan2
import kotlin.math.cbrt
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * Kubelka-Munk pigment mixing, ported function by function from spectral.js 3.0.0.
 * Names follow the original so both read side by side. Only what the game needs is ported:
 * hex in, `mix`, hex out via the gamut-mapping `toString`.
 *
 * ```
 * hex -> sRGB -> lRGB -> R (38 bands) -> KS per band
 *                                          | mix: concentration-weighted average
 *   hex <- gamutMap <- sRGB <- lRGB <- XYZ <- R = KM(KS)
 * ```
 *
 * Operation order matches the JS (sums, `pow` instead of `sqrt`) so results agree to the last digits;
 * `pow` and `cbrt` are not bit-identical between V8 and the JVM, hence the 1e-9 tolerance on OKLab.
 */
object Spectral {

    private const val SIZE = 38
    private const val GAMMA = 2.4

    // Number.EPSILON
    private const val EPSILON = 2.220446049250313e-16

    private val BASE_SPECTRA: Map<String, DoubleArray> = mapOf(
        "W" to doubleArrayOf(
            1.00116072718764, 1.00116065159728, 1.00116031922747, 1.00115867270789,
            1.00115259844552, 1.00113252528998, 1.00108500663327, 1.00099687889453,
            1.00086525152274, 1.0006962900094, 1.00050496114888, 1.00030808187992,
            1.00011966602013, 0.999952765968407, 0.999821836899297, 0.999738609557593,
            0.999709551639612, 0.999731930210627, 0.999799436346195, 0.999900330316671,
            1.00002040652611, 1.00014478793658, 1.00025997903412, 1.00035579697089,
            1.00042753780269, 1.00047623344888, 1.00050720967508, 1.00052519156373,
            1.00053509606896, 1.00054022097482, 1.00054272816784, 1.00054389569087,
            1.00054448212151, 1.00054476959992, 1.00054489887762, 1.00054496254689,
            1.00054498927058, 1.000544996993,
        ),
        "C" to doubleArrayOf(
            0.970585001322962, 0.970592498143425, 0.970625348729891, 0.970786806119017,
            0.971368673228248, 0.973163230621252, 0.976740223158765, 0.981587605491377,
            0.986280265652949, 0.989949147689134, 0.99249270153842, 0.994145680405256,
            0.995183975033212, 0.995756750110818, 0.99591281828671, 0.995606157834528,
            0.994597600961854, 0.99221571549237, 0.986236452783249, 0.967943337264541,
            0.891285004244943, 0.536202477862053, 0.154108119001878, 0.0574575093228929,
            0.0315349873107007, 0.0222633920086335, 0.0182022841492439, 0.016299055973264,
            0.0153656239334613, 0.0149111568733976, 0.0146954339898235, 0.0145964146717719,
            0.0145470156699655, 0.0145228771899495, 0.0145120341118965, 0.0145066940939832,
            0.0145044507314479, 0.0145038009464639,
        ),
        "M" to doubleArrayOf(
            0.990673557319988, 0.990671524961979, 0.990662582353421, 0.990618107644795,
            0.99045148087871, 0.989871081400204, 0.98828660875964, 0.984290692797504,
            0.973934905625306, 0.941817838460145, 0.817390326195156, 0.432472805065729,
            0.13845397825887, 0.0537347216940033, 0.0292174996673231, 0.021313651750859,
            0.0201349530181136, 0.0241323096280662, 0.0372236145223627, 0.0760506552706601,
            0.205375471942399, 0.541268903460439, 0.815841685086486, 0.912817704123976,
            0.946339830166962, 0.959927696331991, 0.966260595230312, 0.969325970058424,
            0.970854536721399, 0.971605066528128, 0.971962769757392, 0.972127272274509,
            0.972209417745812, 0.972249577678424, 0.972267621998742, 0.97227650946215,
            0.972280243306874, 0.97228132482656,
        ),
        "Y" to doubleArrayOf(
            0.0210523371789306, 0.0210564627517414, 0.0210746178695038, 0.0211649058448753,
            0.0215027957272504, 0.0226738799041561, 0.0258235649693629, 0.0334879385639851,
            0.0519069663740307, 0.100749014833473, 0.239129899706847, 0.534804312272748,
            0.79780757864303, 0.911449894067384, 0.953797963004507, 0.971241615465429,
            0.979303123807588, 0.983380119507575, 0.985461246567755, 0.986435046976605,
            0.986738250670141, 0.986617882445032, 0.986277776758643, 0.985860592444056,
            0.98547492767621, 0.985176934765558, 0.984971574014181, 0.984846303415712,
            0.984775351811199, 0.984738066625265, 0.984719648311765, 0.984711023391939,
            0.984706683300676, 0.984704554393091, 0.98470359630937, 0.984703124077552,
            0.98470292561509, 0.984702868122795,
        ),
        "R" to doubleArrayOf(
            0.0315605737777207, 0.0315520718330149, 0.0315148215513658, 0.0313318044982702,
            0.0306729857725527, 0.0286480476989607, 0.0246450407045709, 0.0192960753663651,
            0.0142066612220556, 0.0102942608878609, 0.0076191460521811, 0.005898041083542,
            0.0048233247781713, 0.0042298748350633, 0.0040599171299341, 0.0043533695594676,
            0.0053434425970201, 0.0076917201010463, 0.0135969795736536, 0.0316975442661115,
            0.107861196355249, 0.463812603168704, 0.847055405272011, 0.943185409393918,
            0.968862150696558, 0.978030667473603, 0.982043643854306, 0.983923623718707,
            0.984845484154382, 0.985294275814596, 0.985507295219825, 0.985605071539837,
            0.985653849933578, 0.985677685033883, 0.985688391806122, 0.985693664690031,
            0.985695879848205, 0.985696521463762,
        ),
        "G" to doubleArrayOf(
            0.0095560747554212, 0.0095581580120851, 0.0095673245444588, 0.0096129126297349,
            0.0097837090401843, 0.010378622705871, 0.0120026452378567, 0.0160977721473922,
            0.026706190223168, 0.0595555440185881, 0.186039826532826, 0.570579820116159,
            0.861467768400292, 0.945879089767658, 0.970465486474305, 0.97841363028445,
            0.979589031411224, 0.975533536908632, 0.962288755397813, 0.92312157451312,
            0.793434018943111, 0.459270135902429, 0.185574103666303, 0.0881774959955372,
            0.05436302287667, 0.0406288447060719, 0.034221520431697, 0.0311185790956966,
            0.0295708898336134, 0.0288108739348928, 0.0284486271324597, 0.0282820301724731,
            0.0281988376490237, 0.0281581655342037, 0.0281398910216386, 0.0281308901665811,
            0.0281271086805816, 0.0281260133612096,
        ),
        "B" to doubleArrayOf(
            0.979404752502014, 0.97940070684313, 0.979382903470261, 0.979294364945594,
            0.97896301460857, 0.977814466694043, 0.974724321133836, 0.967198482343973,
            0.949079657530575, 0.900850128940977, 0.76315044546224, 0.465922171649319,
            0.201263280451005, 0.0877524413419623, 0.0457176793291679, 0.0284706050521843,
            0.020527176756985, 0.0165302792310211, 0.0145135107212858, 0.0136003508637687,
            0.0133604258769571, 0.013548894314568, 0.0139594356366992, 0.014443425575357,
            0.0148854440621406, 0.0152254296999746, 0.0154592848180209, 0.0156018026485961,
            0.0156824871281936, 0.0157248764360615, 0.0157458108784121, 0.0157556123350225,
            0.0157605443964911, 0.0157629637515278, 0.0157640525629106, 0.015764589232951,
            0.0157648147772649, 0.0157648801149616,
        ),
    )

    private val CIE_CMF: Array<DoubleArray> = arrayOf(
        doubleArrayOf(
            0.0000646919989576, 0.0002194098998132, 0.0011205743509343, 0.0037666134117111,
            0.011880553603799, 0.0232864424191771, 0.0345594181969747, 0.0372237901162006,
            0.0324183761091486, 0.021233205609381, 0.0104909907685421, 0.0032958375797931,
            0.0005070351633801, 0.0009486742057141, 0.0062737180998318, 0.0168646241897775,
            0.028689649025981, 0.0426748124691731, 0.0562547481311377, 0.0694703972677158,
            0.0830531516998291, 0.0861260963002257, 0.0904661376847769, 0.0850038650591277,
            0.0709066691074488, 0.0506288916373645, 0.035473961885264, 0.0214682102597065,
            0.0125164567619117, 0.0068045816390165, 0.0034645657946526, 0.0014976097506959,
            0.000769700480928, 0.0004073680581315, 0.0001690104031614, 0.0000952245150365,
            0.0000490309872958, 0.0000199961492222,
        ),
        doubleArrayOf(
            0.000001844289444, 0.0000062053235865, 0.0000310096046799, 0.0001047483849269,
            0.0003536405299538, 0.0009514714056444, 0.0022822631748318, 0.004207329043473,
            0.0066887983719014, 0.0098883960193565, 0.0152494514496311, 0.0214183109449723,
            0.0334229301575068, 0.0513100134918512, 0.070402083939949, 0.0878387072603517,
            0.0942490536184085, 0.0979566702718931, 0.0941521856862608, 0.0867810237486753,
            0.0788565338632013, 0.0635267026203555, 0.05374141675682, 0.042646064357412,
            0.0316173492792708, 0.020885205921391, 0.0138601101360152, 0.0081026402038399,
            0.004630102258803, 0.0024913800051319, 0.0012593033677378, 0.000541646522168,
            0.0002779528920067, 0.0001471080673854, 0.0000610327472927, 0.0000343873229523,
            0.0000177059860053, 0.000007220974913,
        ),
        doubleArrayOf(
            0.000305017147638, 0.0010368066663574, 0.0053131363323992, 0.0179543925899536,
            0.0570775815345485, 0.113651618936287, 0.17335872618355, 0.196206575558657,
            0.186082370706296, 0.139950475383207, 0.0891745294268649, 0.0478962113517075,
            0.0281456253957952, 0.0161376622950514, 0.0077591019215214, 0.0042961483736618,
            0.0020055092122156, 0.0008614711098802, 0.0003690387177652, 0.0001914287288574,
            0.0001495555858975, 0.0000923109285104, 0.0000681349182337, 0.0000288263655696,
            0.0000157671820553, 0.0000039406041027, 0.000001584012587, 0.0,
            0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            0.0, 0.0,
        ),
    )

    private val RGB_XYZ: Array<DoubleArray> = arrayOf(
        doubleArrayOf(0.41239079926595934, 0.357584339383878, 0.1804807884018343),
        doubleArrayOf(0.21263900587151027, 0.715168678767756, 0.07219231536073371),
        doubleArrayOf(0.01933081871559182, 0.11919477979462598, 0.9505321522496607),
    )

    private val XYZ_RGB: Array<DoubleArray> = arrayOf(
        doubleArrayOf(3.2409699419045226, -1.537383177570094, -0.4986107602930034),
        doubleArrayOf(-0.9692436362808796, 1.8759675015077202, 0.04155505740717559),
        doubleArrayOf(0.05563007969699366, -0.20397695888897652, 1.0569715142428786),
    )

    private val XYZ_LMS: Array<DoubleArray> = arrayOf(
        doubleArrayOf(0.819022437996703, 0.3619062600528904, -0.1288737815209879),
        doubleArrayOf(0.0329836539323885, 0.9292868615863434, 0.0361446663506424),
        doubleArrayOf(0.0481771893596242, 0.2642395317527308, 0.6335478284694309),
    )

    private val LMS_XYZ: Array<DoubleArray> = arrayOf(
        doubleArrayOf(1.2268798758459243, -0.5578149944602171, 0.2813910456659647),
        doubleArrayOf(-0.0405757452148008, 1.112286803280317, -0.0717110580655164),
        doubleArrayOf(-0.0763729366746601, -0.4214933324022432, 1.5869240198367816),
    )

    private val LMS_LAB: Array<DoubleArray> = arrayOf(
        doubleArrayOf(0.210454268309314, 0.7936177747023054, -0.0040720430116193),
        doubleArrayOf(1.9779985324311684, -2.42859224204858, 0.450593709617411),
        doubleArrayOf(0.0259040424655478, 0.7827717124575296, -0.8086757549230774),
    )

    private val LAB_LMS: Array<DoubleArray> = arrayOf(
        doubleArrayOf(1.0, 0.3963377773761749, 0.2158037573099136),
        doubleArrayOf(1.0, -0.1055613458156586, -0.0638541728258133),
        doubleArrayOf(1.0, -0.0894841775298119, -1.2914855480194092),
    )


    /** spectral.js' `Color`: one colour in every space it needs. sRGB are ints, possibly out of range. */
    private class Color(val R: DoubleArray, val XYZ: DoubleArray, val lRGB: DoubleArray, val sRGB: IntArray) {

        val OKLab: DoubleArray by lazy { XYZ_to_OKLab(XYZ) }
        val OKLCh: DoubleArray by lazy { OKLab_to_OKLCh(OKLab) }
        val KS: DoubleArray by lazy { DoubleArray(SIZE) { KS(R[it]) } }
        val luminance: Double by lazy { max(EPSILON, XYZ[1]) }

        /** spectral.js' `tintingStrength`, always its default. */
        val tintingStrength: Double = 1.0

        fun inGamut(): Boolean = inGamut(lRGB)

        companion object {
            /** `new Color(string)` */
            fun ofHex(hex: String): Color = ofSRGB(parse(hex))

            /** `new Color(sRGB array)` */
            fun ofSRGB(sRGB: IntArray): Color {
                val lRGB = sRGB_to_lRGB(sRGB)
                val R = lRGB_to_R(lRGB)

                return Color(R = R, XYZ = R_to_XYZ(R), lRGB = lRGB, sRGB = sRGB)
            }

            /** `new Color(R array)` */
            fun ofR(R: DoubleArray): Color {
                val XYZ = R_to_XYZ(R)
                val lRGB = XYZ_to_lRGB(XYZ)

                return Color(R = R, XYZ = XYZ, lRGB = lRGB, sRGB = lRGB_to_sRGB(lRGB))
            }
        }
    }

    /** `mix(...[Color(hex), count])` followed by `toString()`. */
    fun mix(parts: List<Pair<String, Int>>): String {
        val colors = parts.map { (hex, count) -> Color.ofHex(hex) to count }

        return toString(mix(colors))
    }

    /** `new Color(hex).OKLab` */
    fun oklabOf(hex: String): DoubleArray = Color.ofHex(hex).OKLab

    private fun mix(colors: List<Pair<Color, Int>>): Color {
        val R = DoubleArray(SIZE)

        for (i in 0 until SIZE) {
            var ksMix = 0.0
            var totalConcentration = 0.0

            for ((color, factor) in colors) {
                val concentration = factor.toDouble().pow(2) * color.tintingStrength.pow(2) * color.luminance

                totalConcentration += concentration
                ksMix += color.KS[i] * concentration
            }

            R[i] = KM(ksMix / totalConcentration)
        }

        return Color.ofR(R)
    }

    /** `Color.toString({ format: 'hex', method: 'map' })`: `#RRGGBB`, upper case. */
    private fun toString(color: Color): String {
        val sRGB = if (color.inGamut()) color.sRGB else gamutMap(color).sRGB

        return "#" + sRGB.joinToString("") { it.toString(16).padStart(2, '0') }.uppercase()
    }

    private fun inGamut(lRGB: DoubleArray): Boolean = lRGB.all { it >= 0 && it <= 1 }

    private fun deltaEOK(OKLab1: DoubleArray, OKLab2: DoubleArray): Double {
        val (L1, a1, b1) = OKLab1
        val (L2, a2, b2) = OKLab2

        return ((L1 - L2).pow(2) + (a1 - a2).pow(2) + (b1 - b2).pow(2)).pow(0.5)
    }

    private fun clamp(x: Double, min: Double = 0.0, max: Double = 1.0): Double = min(max(x, min), max)

    /** Binary search over chroma until the clipped colour is within a just-noticeable difference. */
    private fun gamutMap(color: Color, jnd: Double = 0.03, e: Double = 0.0001): Color {
        val L = color.OKLCh[0]

        if (L >= 1) return Color.ofSRGB(intArrayOf(255, 255, 255))
        if (L <= 0) return Color.ofSRGB(intArrayOf(0, 0, 0))
        if (inGamut(color.lRGB)) return color

        val h = color.OKLCh[2]

        var min = 0.0
        var max = color.OKLCh[1]
        var minInGamut = true

        var current = color.lRGB
        var clipped = lRGB_to_OKLab(DoubleArray(3) { clamp(current[it]) })

        var E = deltaEOK(clipped, lRGB_to_OKLab(current))
        if (E < jnd) {
            return Color.ofSRGB(lRGB_to_sRGB(XYZ_to_lRGB(OKLab_to_XYZ(clipped))))
        }

        while (max - min > e) {
            val chroma = (min + max) / 2

            val OKLab = OKLCh_to_OKLab(doubleArrayOf(L, chroma, h))
            val XYZ = OKLab_to_XYZ(OKLab)

            current = XYZ_to_lRGB(XYZ)

            if (minInGamut && inGamut(current)) {
                min = chroma
            } else {
                clipped = lRGB_to_OKLab(DoubleArray(3) { clamp(current[it]) })
                E = deltaEOK(clipped, OKLab)

                if (E < jnd) {
                    if (jnd - E < e) {
                        break
                    } else {
                        minInGamut = false
                        min = chroma
                    }
                } else {
                    max = chroma
                }
            }
        }

        return Color.ofSRGB(lRGB_to_sRGB(XYZ_to_lRGB(OKLab_to_XYZ(clipped))))
    }

    private fun KS(R: Double): Double = (1 - R).pow(2) / (2 * R)

    private fun KM(KS: Double): Double = 1 + KS - (KS.pow(2) + 2 * KS).pow(0.5)

    private fun uncompand(x: Double): Double = if (x > 0.04045) ((x + 0.055) / 1.055).pow(GAMMA) else x / 12.92

    private fun compand(x: Double): Double = if (x > 0.0031308) 1.055 * x.pow(1.0 / GAMMA) - 0.055 else x * 12.92

    private fun sRGB_to_lRGB(sRGB: IntArray): DoubleArray = DoubleArray(sRGB.size) { uncompand(sRGB[it] / 255.0) }

    /** `Math.round` of JS and Java agree: half rounds up. */
    private fun lRGB_to_sRGB(lRGB: DoubleArray): IntArray =
        IntArray(lRGB.size) { Math.round(compand(lRGB[it]) * 255).toInt() }

    private fun XYZ_to_lRGB(XYZ: DoubleArray): DoubleArray = mulMatVec(XYZ_RGB, XYZ)

    private fun lRGB_to_XYZ(lRGB: DoubleArray): DoubleArray = mulMatVec(RGB_XYZ, lRGB)

    private fun lRGB_to_OKLab(lRGB: DoubleArray): DoubleArray = XYZ_to_OKLab(lRGB_to_XYZ(lRGB))

    private fun XYZ_to_OKLab(XYZ: DoubleArray): DoubleArray {
        val lms = mulMatVec(XYZ_LMS, XYZ).map { cbrt(it) }.toDoubleArray()

        return mulMatVec(LMS_LAB, lms)
    }

    private fun OKLab_to_XYZ(OKLab: DoubleArray): DoubleArray {
        val lms = mulMatVec(LAB_LMS, OKLab).map { it.pow(3) }.toDoubleArray()

        return mulMatVec(LMS_XYZ, lms)
    }

    private fun OKLab_to_OKLCh(OKLab: DoubleArray): DoubleArray {
        val (L, a, b) = OKLab

        val C = (a * a + b * b).pow(0.5)
        val h = atan2(b, a) * 180 / Math.PI

        return doubleArrayOf(L, C, if (h >= 0) h else h + 360)
    }

    private fun OKLCh_to_OKLab(OKLCh: DoubleArray): DoubleArray {
        val (L, C, h) = OKLCh

        val a = C * cos(h * Math.PI / 180)
        val b = C * sin(h * Math.PI / 180)

        return doubleArrayOf(L, a, b)
    }

    private fun R_to_XYZ(R: DoubleArray): DoubleArray = mulMatVec(CIE_CMF, R)

    /** Pre-calculated reflectances: a colour as white + C/M/Y + R/G/B parts of the base spectra. */
    private fun lRGB_to_R(lRGB: DoubleArray): DoubleArray {
        val w = min(lRGB[0], min(lRGB[1], lRGB[2]))

        val rgb = doubleArrayOf(lRGB[0] - w, lRGB[1] - w, lRGB[2] - w)

        val c = min(rgb[1], rgb[2])
        val m = min(rgb[0], rgb[2])
        val y = min(rgb[0], rgb[1])
        val r = max(0.0, min(rgb[0] - rgb[2], rgb[0] - rgb[1]))
        val g = max(0.0, min(rgb[1] - rgb[2], rgb[1] - rgb[0]))
        val b = max(0.0, min(rgb[2] - rgb[1], rgb[2] - rgb[0]))

        val bw = BASE_SPECTRA.getValue("W")
        val bc = BASE_SPECTRA.getValue("C")
        val bm = BASE_SPECTRA.getValue("M")
        val by = BASE_SPECTRA.getValue("Y")
        val br = BASE_SPECTRA.getValue("R")
        val bg = BASE_SPECTRA.getValue("G")
        val bb = BASE_SPECTRA.getValue("B")

        return DoubleArray(SIZE) { i ->
            max(EPSILON, w * bw[i] + c * bc[i] + m * bm[i] + y * by[i] + r * br[i] + g * bg[i] + b * bb[i])
        }
    }

    /** `utils.dot` sums left to right starting at 0, like the JS `reduce`. */
    private fun mulMatVec(m: Array<DoubleArray>, v: DoubleArray): DoubleArray = DoubleArray(m.size) { row ->
        var acc = 0.0
        for (i in v.indices) acc += m[row][i] * v[i]
        acc
    }

    /** Hex `#RGB` or `#RRGGBB` to sRGB ints; alpha is dropped like `.slice(0, 3)`. */
    private fun parse(str: String): IntArray {
        val s = str.removePrefix("#").let { if (it.length == 3) it.map { c -> "$c$c" }.joinToString("") else it }

        return IntArray(3) { s.substring(it * 2, it * 2 + 2).toInt(16) }
    }
}
