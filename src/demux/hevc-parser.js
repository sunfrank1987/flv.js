/*
 * Copyright (C) 2016 Bilibili. All Rights Reserved.
 *
 * @author zheng qian <xqq@xqq.im>
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Log from '../utils/logger.js';
import ExpGolomb from './exp-golomb.js';

class HevcSps {

}

class HevcVps {

}

class HevcPTL {

}
class pic_conf_win {

}

class temporal_layer {

}

class HevcPcm {

}

class HevcRps {

}

class HevcParser {

    static FFMAX(a, b) {
        return ((a) > (b) ? (a) : (b));
    }

    static FFMIN(a, b) {
        return ((a) < (b) ? (a) : (b));
    }
    static av_mod_uintp2(a, p) {
        return a & ((1 << p) - 1);
    }
    static init() {
        // 
        let constants = HevcParser.constants = {};

        constants.INT_MAX = 2147483647;

        constants.default_scaling_list_intra = new Uint8Array([
            16, 16, 16, 16, 17, 18, 21, 24,
            16, 16, 16, 16, 17, 19, 22, 25,
            16, 16, 17, 18, 20, 22, 25, 29,
            16, 16, 18, 21, 24, 27, 31, 36,
            17, 17, 20, 24, 30, 35, 41, 47,
            18, 19, 22, 27, 35, 44, 54, 65,
            21, 22, 25, 31, 41, 54, 70, 88,
            24, 25, 29, 36, 47, 65, 88, 115
        ]);
        
        constants.default_scaling_list_inter = new Uint8Array([
            16, 16, 16, 16, 17, 18, 20, 24,
            16, 16, 16, 17, 18, 20, 24, 25,
            16, 16, 17, 18, 20, 24, 25, 28,
            16, 17, 18, 20, 24, 25, 28, 33,
            17, 18, 20, 24, 25, 28, 33, 41,
            18, 20, 24, 25, 28, 33, 41, 54,
            20, 24, 25, 28, 33, 41, 54, 71,
            24, 25, 28, 33, 41, 54, 71, 91
        ]);
        /*
        static const AVRational vui_sar[] = {
            {  0,   1 },
            {  1,   1 },
            { 12,  11 },
            { 10,  11 },
            { 16,  11 },
            { 40,  33 },
            { 24,  11 },
            { 20,  11 },
            { 32,  11 },
            { 80,  33 },
            { 18,  11 },
            { 15,  11 },
            { 64,  33 },
            { 160, 99 },
            {  4,   3 },
            {  3,   2 },
            {  2,   1 },
        };
        */
        constants.hevc_sub_width_c = new Uint8Array([
            1, 2, 2, 1
        ]);
        
        constants.hevc_sub_height_c = new Uint8Array([
            1, 2, 1, 1
        ]);

        constants.HEVC_NAL_UNIT_CODED_SLICE_BLA_W_LP = 16;
        constants.HEVC_NAL_UNIT_CODED_SLICE_BLA_W_RADL = 17;
        constants.HEVC_NAL_UNIT_CODED_SLICE_BLA_N_LP = 18;
        constants.HEVC_NAL_UNIT_CODED_SLICE_IDR_W_RADL = 19;
        constants.HEVC_NAL_UNIT_CODED_SLICE_IDR_N_LP = 20;
        constants.HEVC_NAL_UNIT_CODED_SLICE_CRA = 21;

        constants.HEVC_MAX_SUB_LAYERS = 7;
        constants.HEVC_MAX_SPS_COUNT = 16;
        constants.HEVC_MAX_REFS = 16;
        
        constants.FF_PROFILE_HEVC_MAIN =                        1;
        constants.FF_PROFILE_HEVC_MAIN_10 =                     2;
        constants.FF_PROFILE_HEVC_MAIN_STILL_PICTURE =          3;
        constants.FF_PROFILE_HEVC_REXT =                        4;
    }

    static _ebsp2rbsp(uint8array) {
        let src = uint8array;
        let src_length = src.byteLength;
        let dst = new Uint8Array(src_length);
        let dst_idx = 0;

        for (let i = 0; i < src_length; i++) {
            if (i >= 2) {
                // Unescape: Skip 0x03 after 00 00
                if (src[i] === 0x03 && src[i - 1] === 0x00 && src[i - 2] === 0x00) {
                    continue;
                }
            }
            dst[dst_idx] = src[i];
            dst_idx++;
        }

        return new Uint8Array(dst.buffer, 0, dst_idx);
    }

    static ff_hevc_decode_short_term_rps(gb, rps, sps, is_slice_header) {
        let rps_predict = 0;
        let delta_poc;
        let k0 = 0;
        let k1 = 0;
        let k  = 0;
        let i;

        if (rps !== sps.st_rps && sps.nb_st_rps > 0)
            rps_predict = gb.readBits(1);//  get_bits1(gb);

        Log.i(this.TAG, `rps_predict: ${rps_predict}.`);
        if (rps_predict === 1) {
            // const ShortTermRPS *rps_ridx;
            let rps_ridx;
            let delta_rps;
            let abs_delta_rps;
            let use_delta_flag = 0;
            let delta_rps_sign;

            if (is_slice_header) {
                let delta_idx = gb.readUEG() + 1;// get_ue_golomb_long(gb) + 1;
                if (delta_idx > sps.nb_st_rps) {
                    Log.e(this.TAG,
                    `Invalid value of delta_idx in slice header RPS: ${delta_idx} > ${sps.nb_st_rps}.`);
                    return -1;
                }
                rps_ridx = sps.st_rps[sps.nb_st_rps - delta_idx];
                rps.rps_idx_num_delta_pocs = rps_ridx.num_delta_pocs;
            } else {
                rps_ridx = sps.st_rps[rps - sps.st_rps - 1];
            }

            delta_rps_sign = gb.readBits(1);// get_bits1(gb);
            abs_delta_rps  = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
            if (abs_delta_rps < 1 || abs_delta_rps > 32768) {
                Log.e(this.TAG,
                'Invalid value of abs_delta_rps: ${abs_delta_rps}');
                return -1;
            }

            delta_rps      = (1 - (delta_rps_sign << 1)) * abs_delta_rps;
            for (i = 0; i <= rps_ridx.num_delta_pocs; i++) {
                let used = rps.used[k] = gb.readBits(1); // get_bits1(gb);

                if (!used)
                    use_delta_flag = gb.readBits(1);// get_bits1(gb);

                if (used || use_delta_flag) {
                    if (i < rps_ridx.num_delta_pocs)
                        delta_poc = delta_rps + rps_ridx.delta_poc[i];
                    else
                        delta_poc = delta_rps;
                    rps.delta_poc[k] = delta_poc;
                    if (delta_poc < 0)
                        k0++;
                    else
                        k1++;
                    k++;
                }
            }

            // if (k >= FF_ARRAY_ELEMS(rps.used)) {
            //     Log.e(this.TAG, 'Invalid num_delta_pocs: ${k}.');
            //     return -1;
            // }

            rps.num_delta_pocs    = k;
            rps.num_negative_pics = k0;
            // sort in increasing order (smallest first)
            if (rps.num_delta_pocs !== 0) {
                let used, tmp;
                for (i = 1; i < rps.num_delta_pocs; i++) {
                    delta_poc = rps.delta_poc[i];
                    used      = rps.used[i];
                    for (k = i - 1; k >= 0; k--) {
                        tmp = rps.delta_poc[k];
                        if (delta_poc < tmp) {
                            rps.delta_poc[k + 1] = tmp;
                            rps.used[k + 1]      = rps.used[k];
                            rps.delta_poc[k]     = delta_poc;
                            rps.used[k]          = used;
                        }
                    }
                }
            }
            if ((rps.num_negative_pics >> 1) !== 0) {
                let used;
                k = rps.num_negative_pics - 1;
                // flip the negative values to largest first
                for (i = 0; i < rps.num_negative_pics >> 1; i++) {
                    delta_poc         = rps.delta_poc[i];
                    used              = rps.used[i];
                    rps.delta_poc[i] = rps.delta_poc[k];
                    rps.used[i]      = rps.used[k];
                    rps.delta_poc[k] = delta_poc;
                    rps.used[k]      = used;
                    k--;
                }
            }
        } else {
            let prev, nb_positive_pics;
            rps.num_negative_pics = gb.readUEG(); // get_ue_golomb_long(gb);
            nb_positive_pics      = gb.readUEG(); // get_ue_golomb_long(gb);

            if (rps.num_negative_pics >= HevcParser.constants.HEVC_MAX_REFS ||
                nb_positive_pics >= HevcParser.constants.HEVC_MAX_REFS) {
                Log.e(this.TAG, 'Too many refs in a short term RPS.\n');
                return -1;
            }

            rps.num_delta_pocs = rps.num_negative_pics + nb_positive_pics;

            Log.i(this.TAG, `rps.num_delta_pocs: ${rps.num_delta_pocs}.`);
            Log.i(this.TAG, `nb_positive_pics: ${nb_positive_pics}.`);

            if (rps.num_delta_pocs === 1) {
                prev = 0;
                rps.delta_poc = new Array();
                rps.used = new Array();
                for (i = 0; i < rps.num_negative_pics; i++) {
                    delta_poc = gb.readUEG() + 1;// get_ue_golomb_long(gb) + 1;
                    if (delta_poc < 1 || delta_poc > 32768) {
                        Log.e(this.TAG,
                        'Invalid value of delta_poc: ${delta_poc}');
                        return -1;
                    }
                    prev -= delta_poc;
                    rps.delta_poc[i] = prev;
                    rps.used[i]      = gb.readBits(1);//  get_bits1(gb);
                }
                prev = 0;
                for (i = 0; i < nb_positive_pics; i++) {
                    delta_poc = gb.readUEG() + 1;//  get_ue_golomb_long(gb) + 1;
                    if (delta_poc < 1 || delta_poc > 32768) {
                        Log.e(this.TAG,
                        'Invalid value of delta_poc: ${delta_poc}');
                        return -1;
                    }
                    prev += delta_poc;
                    rps.delta_poc[rps.num_negative_pics + i] = prev;
                    rps.used[rps.num_negative_pics + i]      = gb.readBits(1);// get_bits1(gb);
                }
            }
        }
        Log.i(this.TAG, '[out]');
        return 0;
    }

    static decode_vui(gb, avctx, apply_defdispwin, sps) {
        //
        Log.i(this.TAG, '[IN] decode_vui');
        //

        Log.i(this.TAG, '[OUT] decode_vui');
    }
    static parseSPS(uint8array) {
        let rbsp = HevcParser._ebsp2rbsp(uint8array);
        let gb = new ExpGolomb(rbsp);
        let sps = new HevcSps();
        let i;
        // let apply_defdispwin = 1;
        let apply_defdispwin = 0;
        let bit_depth = 8;
        let chroma_format_idc = 1;
        let chroma_format = 420;
        let chroma_format_table = [0, 420, 422, 444];

        sps.vps_id = gb.readBits(4);

        sps.max_sub_layers = gb.readBits(3); // +1
        if (sps.max_sub_layers > HevcParser.constants.HEVC_MAX_SUB_LAYERS) {
            Log.e(this.TAG, `sps_max_sub_layers out of range: ${sps.max_sub_layers}`);
            return -1;
        }
        sps.temporal_id_nesting_flag = gb.readBits(1);
        //
        Log.i(this.TAG, `sps.vps_id: ${sps.vps_id}`);
        Log.i(this.TAG, `sps.max_sub_layers: ${sps.max_sub_layers}`);
        Log.i(this.TAG, `sps.temporal_id_nesting_flag: ${sps.temporal_id_nesting_flag}`);
        sps.ptl = new HevcPTL();
        if (HevcParser.hvcc_parse_ptl(gb, sps.ptl, sps.max_sub_layers) < 0) {
            Log.e(this.TAG, 'SPS parse_ptl filed.');
            return -1;
        }
        // sps_seq_parameter_set_id
        let sps_id = gb.readUEG();// get_ue_golomb_long(gb);
        Log.i(this.TAG, `sps.sps_id: ${sps_id}`);

        if (sps_id >= HevcParser.constants.HEVC_MAX_SPS_COUNT) {
            Log.e(this.TAG, 'SPS id out of range: ${sps_id}');
            return -1;
        }
        //
        Log.i(this.TAG, `sps_id ${sps_id}.`);

        sps.chroma_format_idc =  gb.readUEG();// get_ue_golomb_long(gb);
        Log.i(this.TAG, `chroma_format_idc ${sps.chroma_format_idc}.`);

        if (sps.chroma_format_idc > 3) {
            Log.e(this.TAG, 'chroma_format_idc ${sps.chroma_format_idc} is invalid.');
            return -1;
        }
        if (sps.chroma_format_idc == 3) {
            sps.separate_colour_plane_flag = gb.readBits(1);// get_bits1(gb);
        }

        if (sps.chroma_format_idc <= 3) {
            chroma_format = chroma_format_table[sps.chroma_format_idc];
        }

        if (sps.separate_colour_plane_flag) {
            sps.chroma_format_idc = 0;
        }
        Log.i(this.TAG, `chroma_format: ${chroma_format}`);

        sps.width  = gb.readUEG(); // get_ue_golomb_long(gb);
        sps.height = gb.readUEG(); // get_ue_golomb_long(gb);
        Log.i(this.TAG, `sps.width: ${sps.width} height ${sps.height}`);

        // conformance_window_flag
        if (gb.readBool()) {
            //
            let vert_mult  = HevcParser.constants.hevc_sub_height_c[sps.chroma_format_idc];
            let horiz_mult = HevcParser.constants.hevc_sub_width_c[sps.chroma_format_idc];
            Log.i(this.TAG, `vert_mult: ${vert_mult} horiz_mult ${horiz_mult}`);
            sps.pic_conf_win = new pic_conf_win();
            sps.output_window = new pic_conf_win();

            sps.pic_conf_win.left_offset   = gb.readUEG() * horiz_mult; // get_ue_golomb_long(gb) * horiz_mult;
            sps.pic_conf_win.right_offset  = gb.readUEG() * horiz_mult; // get_ue_golomb_long(gb) * horiz_mult;
            sps.pic_conf_win.top_offset    = gb.readUEG() *  vert_mult; // get_ue_golomb_long(gb) *  vert_mult;
            sps.pic_conf_win.bottom_offset = gb.readUEG() *  vert_mult; // get_ue_golomb_long(gb) *  vert_mult;
            /*
            if (avctx->flags2 & AV_CODEC_FLAG2_IGNORE_CROP) {
                av_log(avctx, AV_LOG_DEBUG,
                    'discarding sps conformance window, '
                    'original values are l:%u r:%u t:%u b:%u\n',
                    sps.pic_conf_win.left_offset,
                    sps.pic_conf_win.right_offset,
                    sps.pic_conf_win.top_offset,
                    sps.pic_conf_win.bottom_offset);

                sps.pic_conf_win.left_offset   =
                sps.pic_conf_win.right_offset  =
                sps.pic_conf_win.top_offset    =
                sps.pic_conf_win.bottom_offset = 0;
            }
            */
            sps.output_window = sps.pic_conf_win;
        }

        //
        sps.bit_depth   = gb.readUEG() + 8; // get_ue_golomb_long(gb) + 8;
        Log.i(this.TAG, `sps.bit_depth: ${sps.bit_depth}`);

        bit_depth = sps.bit_depth;
        let bit_depth_chroma = gb.readUEG() + 8;// get_ue_golomb_long(gb) + 8;
        //
        if (sps.chroma_format_idc !== 0 && bit_depth_chroma !== sps.bit_depth) {
            Log.e(this.TAG,
                   'Luma bit depth (${sps.bit_depth}) is different from chroma bit depth (${bit_depth_chroma}), this is unsupported.');
            return -1;
        }
        sps.bit_depth_chroma = bit_depth_chroma;
        Log.i(this.TAG, `sps.bit_depth_chroma: ${sps.bit_depth_chroma}`);

        sps.log2_max_poc_lsb = gb.readUEG() + 4;// get_ue_golomb_long(gb) + 4;
        if (sps.log2_max_poc_lsb > 16) {
            Log.e(this.TAG, 'log2_max_pic_order_cnt_lsb_minus4 out range: ${sps.log2_max_poc_lsb - 4}');
            return -1;
        }
        Log.i(this.TAG, `sps.log2_max_poc_lsb: ${sps.log2_max_poc_lsb}`);

        //
        let sublayer_ordering_info = gb.readBits(1); // get_bits1(gb);
        let start = sublayer_ordering_info ? 0 : sps.max_sub_layers - 1;
        Log.i(this.TAG, `sublayer_ordering_info: ${sublayer_ordering_info}`);
        sps.temporal_layer = new Array();
        for (i = start; i < sps.max_sub_layers; i++) {
            sps.temporal_layer[i] = new temporal_layer();
            sps.temporal_layer[i].max_dec_pic_buffering = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
            sps.temporal_layer[i].num_reorder_pics      = gb.readUEG();     // get_ue_golomb_long(gb);
            sps.temporal_layer[i].max_latency_increase  = gb.readUEG() - 1; // get_ue_golomb_long(gb) - 1;
            if (sps.temporal_layer[i].max_dec_pic_buffering > HevcParser.constants.HEVC_MAX_DPB_SIZE) {
                Log.e(this.TAG, 'sps_max_dec_pic_buffering_minus1 out of range: ${sps.temporal_layer[i].max_dec_pic_buffering - 1}');
                return -1;
            }
            if (sps.temporal_layer[i].num_reorder_pics > sps.temporal_layer[i].max_dec_pic_buffering - 1) {
                Log.w(this.TAG, 'sps_max_num_reorder_pics out of range: ${sps.temporal_layer[i].num_reorder_pics}');
                /*
                if (avctx->err_recognition & AV_EF_EXPLODE ||
                    sps.temporal_layer[i].num_reorder_pics > HEVC_MAX_DPB_SIZE - 1) {
                    return -1;
                }
                */
                sps.temporal_layer[i].max_dec_pic_buffering = sps.temporal_layer[i].num_reorder_pics + 1;
            }
        }
        //
        if (sublayer_ordering_info === 0) {
            for (i = 0; i < start; i++) {
                sps.temporal_layer[i].max_dec_pic_buffering = sps.temporal_layer[start].max_dec_pic_buffering;
                sps.temporal_layer[i].num_reorder_pics      = sps.temporal_layer[start].num_reorder_pics;
                sps.temporal_layer[i].max_latency_increase  = sps.temporal_layer[start].max_latency_increase;
            }
        }
        
        sps.log2_min_cb_size                    = gb.readUEG() + 3; // get_ue_golomb_long(gb) + 3;
        sps.log2_diff_max_min_coding_block_size = gb.readUEG();    // get_ue_golomb_long(gb);
        sps.log2_min_tb_size                    = gb.readUEG() + 2; // get_ue_golomb_long(gb) + 2;
        let log2_diff_max_min_transform_block_size  = gb.readUEG();    // get_ue_golomb_long(gb);
        sps.log2_max_trafo_size                 = log2_diff_max_min_transform_block_size +
                                                   sps.log2_min_tb_size;
    
        Log.i(this.TAG, `log2_min_cb_size: ${sps.log2_min_cb_size}`);
        Log.i(this.TAG, `log2_diff_max_min_coding_block_size: ${sps.log2_diff_max_min_coding_block_size}`);

        if (sps.log2_min_cb_size < 3 || sps.log2_min_cb_size > 30) {
            Log.e(this.TAG, 'Invalid value ${sps.log2_min_cb_size} for log2_min_cb_size');
            return -1;
        }
    
        if (sps.log2_diff_max_min_coding_block_size > 30) {
            Log.e(this.TAG, 'Invalid value ${sps.log2_diff_max_min_coding_block_size} for log2_diff_max_min_coding_block_size');
            return -1;
        }
    
        if (sps.log2_min_tb_size >= sps.log2_min_cb_size || sps.log2_min_tb_size < 2) {
            Log.e(this.TAG, 'Invalid value for log2_min_tb_size');
            return -1;
        }
    
        if (log2_diff_max_min_transform_block_size < 0 || log2_diff_max_min_transform_block_size > 30) {
            Log.e(this.TAG, 'Invalid value ${log2_diff_max_min_transform_block_size} for log2_diff_max_min_transform_block_size');
            return -1;
        }
    
        sps.max_transform_hierarchy_depth_inter = gb.readUEG();// get_ue_golomb_long(gb);
        sps.max_transform_hierarchy_depth_intra = gb.readUEG();// get_ue_golomb_long(gb);
        Log.i(this.TAG, `max_transform_hierarchy_depth_inter: ${sps.max_transform_hierarchy_depth_inter}`);
        Log.i(this.TAG, `max_transform_hierarchy_depth_intra: ${sps.max_transform_hierarchy_depth_intra}`);
        
        sps.scaling_list_enable_flag = gb.readBits(1);// get_bits1(gb);
        if (sps.scaling_list_enable_flag === 1) {
            // set_default_scaling_list_data(&sps.scaling_list);
    
            if (gb.readBool()) { // get_bits1(gb)
                // ret = scaling_list_data(gb, avctx, sps.scaling_list, sps);
                // if (ret < 0)
                //     return ret;
            }
        }
        Log.i(this.TAG, `scaling_list_enable_flag: ${sps.scaling_list_enable_flag}`);
        
        sps.amp_enabled_flag = gb.readBits(1);// get_bits1(gb);
        sps.sao_enabled      = gb.readBits(1);// get_bits1(gb);
        Log.i(this.TAG, `amp_enabled_flag: ${sps.amp_enabled_flag}`);
        Log.i(this.TAG, `sao_enabled: ${sps.sao_enabled}`);
    
        sps.pcm_enabled_flag = gb.readBits(1);// get_bits1(gb);
        Log.i(this.TAG, `pcm_enabled_flag: ${sps.pcm_enabled_flag}`);

        if (sps.pcm_enabled_flag === 1) {
            sps.pcm = new HevcPcm();
            sps.pcm.bit_depth   = gb.readBits(4) + 1;       // get_bits(gb, 4) + 1;
            sps.pcm.bit_depth_chroma = gb.readBits(4) + 1;  // get_bits(gb, 4) + 1;
            sps.pcm.log2_min_pcm_cb_size = gb.readUEG() + 3; // get_ue_golomb_long(gb) + 3;
            sps.pcm.log2_max_pcm_cb_size = sps.pcm.log2_min_pcm_cb_size +
                                            gb.readUEG();// get_ue_golomb_long(gb);
            if (HevcParser.FFMAX(sps.pcm.bit_depth, sps.pcm.bit_depth_chroma) > sps.bit_depth) {
                Log.e(this.TAG,
                       `PCM bit depth (${sps.pcm.bit_depth}, ${sps.pcm.bit_depth_chroma}) is greater than normal bit depth (${sps.bit_depth})`);
                return -1;
            }
            sps.pcm.loop_filter_disable_flag = gb.readBits(1); // get_bits1(gb);
        }
    
        sps.nb_st_rps = gb.readUEG(); //  get_ue_golomb_long(gb);
        if (sps.nb_st_rps > HevcParser.constants.HEVC_MAX_SHORT_TERM_REF_PIC_SETS) {
            Log.e(this.TAG, 'Too many short term RPS: ${sps.nb_st_rps}.');
            return -1;
        }

        Log.i(this.TAG, `RPS: ${sps.nb_st_rps}.`);

        for (i = 0; i < sps.nb_st_rps; i++) {
            sps.st_rps = new Array(64); //HevcRps();
            
            sps.st_rps[i] = new HevcRps();

            if (HevcParser.ff_hevc_decode_short_term_rps(gb, sps.st_rps[i], sps, 0) < 0) {
                Log.e(this.TAG, 'Too many long term ref pics: ${sps.nb_st_rps}.');
                return -1;
            }
        }
    
        sps.long_term_ref_pics_present_flag = gb.readBits(1); // get_bits1(gb);
        Log.i(this.TAG, `long_term_ref_pics_present_flag: ${sps.long_term_ref_pics_present_flag}.`);
        
        if (sps.long_term_ref_pics_present_flag === 1) {
            sps.num_long_term_ref_pics_sps = gb.readUEG(); // get_ue_golomb_long(gb);
            if (sps.num_long_term_ref_pics_sps > HevcParser.constants.HEVC_MAX_LONG_TERM_REF_PICS) {
                Log.e(this.TAG, 'Too many long term ref pics: ${sps.num_long_term_ref_pics_sps}.');
                return -1;
            }
            sps.lt_ref_pic_poc_lsb_sps = new Array();
            sps.used_by_curr_pic_lt_sps_flag = new Array();
            for (i = 0; i < sps.num_long_term_ref_pics_sps; i++) {
                sps.lt_ref_pic_poc_lsb_sps[i]       = gb.readBits(sps.log2_max_poc_lsb);// get_bits(gb, sps.log2_max_poc_lsb);
                sps.used_by_curr_pic_lt_sps_flag[i] = gb.readBits(1); //get_bits1(gb);
            }
        }
    
        sps.sps_temporal_mvp_enabled_flag          = gb.readBits(1); // get_bits1(gb);
        sps.sps_strong_intra_smoothing_enable_flag = gb.readBits(1); // get_bits1(gb);
        // sps.vui.sar = { num: 0, den: 1 }; //
        let sar = { num: 0, den: 1 }; //
        let vui_present =  gb.readBits(1); // get_bits1(gb);

        Log.i(this.TAG, `sps_temporal_mvp_enabled_flag: ${sps.sps_temporal_mvp_enabled_flag}.`);
        Log.i(this.TAG, `sps_strong_intra_smoothing_enable_flag: ${sps.sps_strong_intra_smoothing_enable_flag}.`);
        Log.i(this.TAG, `vui_present: ${vui_present}.`);
/*
        if (vui_present === 1) {
            HevcParser.decode_vui(gb, apply_defdispwin, sps);
        }
    
        if (gb.readBool()) { // get_bits1(gb) sps_extension_flag
            sps.sps_range_extension_flag = gb.readBits(1);// get_bits1(gb);
            gb.readBits(7);// skip_bits(gb, 7); //sps_extension_7bits = get_bits(gb, 7);
            if (sps.sps_range_extension_flag === 1) {
                sps.transform_skip_rotation_enabled_flag = gb.readBits(1);// get_bits1(gb);
                sps.transform_skip_context_enabled_flag  = gb.readBits(1);// get_bits1(gb);
                sps.implicit_rdpcm_enabled_flag = gb.readBits(1); // get_bits1(gb);
    
                sps.explicit_rdpcm_enabled_flag = gb.readBits(1); // get_bits1(gb);
    
                sps.extended_precision_processing_flag = gb.readBits(1); // get_bits1(gb);
                if (sps.extended_precision_processing_flag) {
                    Log.w(this.TAG, 'extended_precision_processing_flag not yet implemented\n');
                }
    
                sps.intra_smoothing_disabled_flag       = gb.readBits(1); // get_bits1(gb);
                sps.high_precision_offsets_enabled_flag = gb.readBits(1); // get_bits1(gb);
                if (sps.high_precision_offsets_enabled_flag) {
                    Log.w(this.TAG, 'high_precision_offsets_enabled_flag not yet implemented\n');
                }
    
                sps.persistent_rice_adaptation_enabled_flag = gb.readBits(1); // get_bits1(gb);
    
                sps.cabac_bypass_alignment_enabled_flag  = gb.readBits(1); // get_bits1(gb);
                if (sps.cabac_bypass_alignment_enabled_flag) {
                    Log.w(this.TAG, 'cabac_bypass_alignment_enabled_flag not yet implemented\n');
                }
            }
        }
*/
        if (apply_defdispwin === 1) {
            sps.output_window.left_offset   += sps.vui.def_disp_win.left_offset;
            sps.output_window.right_offset  += sps.vui.def_disp_win.right_offset;
            sps.output_window.top_offset    += sps.vui.def_disp_win.top_offset;
            sps.output_window.bottom_offset += sps.vui.def_disp_win.bottom_offset;
        }
    
        let ow = sps.output_window;
        if (ow.left_offset >= HevcParser.constants.INT_MAX - ow.right_offset     ||
            ow.top_offset  >= HevcParser.constants.INT_MAX - ow.bottom_offset    ||
            ow.left_offset + ow.right_offset  >= sps.width ||
            ow.top_offset  + ow.bottom_offset >= sps.height) {
            Log.w(this.TAG, 'Invalid cropping offsets: ${ow.left_offset}, ${ow.right_offset}, ${ow.top_offset}, ${ow.bottom_offset}');
            // if (avctx->err_recognition & AV_EF_EXPLODE) {
            //     return -1;
            // }
            Log.w(this.TAG, 'Displaying the whole video surface.');
            // memset(ow, 0, sizeof(*ow));
            // memset(&sps.pic_conf_win, 0, sizeof(sps.pic_conf_win));
        }
    
        // Inferred parameters
        sps.log2_ctb_size = sps.log2_min_cb_size +
                             sps.log2_diff_max_min_coding_block_size;
        sps.log2_min_pu_size = sps.log2_min_cb_size - 1;
    
        if (sps.log2_ctb_size > HevcParser.constants.HEVC_MAX_LOG2_CTB_SIZE) {
            Log.e(this.TAG, 'CTB size out of range: 2^${log2_ctb_size}\n', sps.log2_ctb_size);
            return -1;
        }
        if (sps.log2_ctb_size < 4) {
            Log.e(this.TAG,
                   'log2_ctb_size ${sps.log2_ctb_size} differs from the bounds of any known profile.');
            // avpriv_request_sample(avctx, 'log2_ctb_size %d', sps.log2_ctb_size);
            return -1;
        }
    
        sps.ctb_width  = (sps.width  + (1 << sps.log2_ctb_size) - 1) >> sps.log2_ctb_size;
        sps.ctb_height = (sps.height + (1 << sps.log2_ctb_size) - 1) >> sps.log2_ctb_size;
        sps.ctb_size   = sps.ctb_width * sps.ctb_height;
    
        sps.min_cb_width  = sps.width  >> sps.log2_min_cb_size;
        sps.min_cb_height = sps.height >> sps.log2_min_cb_size;
        sps.min_tb_width  = sps.width  >> sps.log2_min_tb_size;
        sps.min_tb_height = sps.height >> sps.log2_min_tb_size;
        sps.min_pu_width  = sps.width  >> sps.log2_min_pu_size;
        sps.min_pu_height = sps.height >> sps.log2_min_pu_size;
        sps.tb_mask       = (1 << (sps.log2_ctb_size - sps.log2_min_tb_size)) - 1;
    
        sps.qp_bd_offset = 6 * (sps.bit_depth - 8);
    
        if (HevcParser.av_mod_uintp2(sps.width, sps.log2_min_cb_size) ||
            HevcParser.av_mod_uintp2(sps.height, sps.log2_min_cb_size)) {
            Log.e(this.TAG, 'Invalid coded frame dimensions.\n');
            return -1;
        }
    
        if (sps.max_transform_hierarchy_depth_inter > sps.log2_ctb_size - sps.log2_min_tb_size) {
            Log.e(this.TAG, 'max_transform_hierarchy_depth_inter out of range: ${sps.max_transform_hierarchy_depth_inter}\n');
            return -1;
        }
        if (sps.max_transform_hierarchy_depth_intra > sps.log2_ctb_size - sps.log2_min_tb_size) {
            Log.e(this.TAG, 'max_transform_hierarchy_depth_intra out of range: ${sps.max_transform_hierarchy_depth_intra}\n');
            return -1;
        }
        if (sps.log2_max_trafo_size > HevcParser.FFMIN(sps.log2_ctb_size, 5)) {
            Log.e(this.TAG,
                   'max transform block size out of range: ${sps.log2_max_trafo_size}');
            return -1;
        }
    
        if (gb.getBitsLeft() < 0) {
            Log.e(this.TAG, 'Overread SPS by -${gb.getBitsLeft()} bits');
            return -1;
        }

        gb.destroy();
        gb = null;
        let profile_string = 'main';
        let level_string = '93';
        let ref_frames = 0;
        Log.i(this.TAG, 'End Parse SPS.');
        return {
            profile_string: profile_string,  // baseline, high, high10, ...
            level_string: level_string,  // 3, 3.1, 4, 4.1, 5, 5.1, ...
            bit_depth: bit_depth,  // 8bit, 10bit, ...
            ref_frames: ref_frames,
            chroma_format: chroma_format,  // 4:2:0, 4:2:2, ...
            chroma_format_string: HevcParser.getChromaFormatString(chroma_format),

            frame_rate: {
                fixed: 30, // fps_fixed,
                fps: 30, // fps,
                fps_den: 1, //fps_den,
                fps_num: 20, // fps_num
            },

            sar_ratio: {
                width: 1, // sar_width,
                height: 1, // sar_height
            },

            codec_size: {
                width: sps.width,  // codec_width,
                height: sps.height, // codec_height
            },

            present_size: {
                width: sps.width, // 1920, // present_width,
                height: sps.height, // 1080 codec_height
            }
        };
    }
    
    static decode_profile_tier_level(gb, ptl) {
        //
        Log.i(this.TAG, `decode_profile_tier_level ${gb.getBitsLeft()} bits`);
        /*
        if (gb.getBitsLeft() < 2 + 1 + 5 + 32 + 4 + 43 + 1) {
            Log.w(this.TAG, `getBitsLeft:${gb.getBitsLeft()}`);
            return 0;
        }
        */
        let i;
        ptl.profile_space = gb.readBits(2);
        ptl.tier_flag     = gb.readBits(1);
        let profile_idc   = gb.readBits(5);
        ptl.profile_idc   = profile_idc;
        //
        if (profile_idc === HevcParser.constants.FF_PROFILE_HEVC_MAIN) {
            Log.v(this.TAG, 'Main profile bitstream');
        } else if (profile_idc === HevcParser.constants.FF_PROFILE_HEVC_MAIN_10) {
            Log.v(this.TAG, 'Main 10 profile bitstream');
        } else if (profile_idc === HevcParser.constants.FF_PROFILE_HEVC_MAIN_STILL_PICTURE) {
            Log.v(this.TAG, 'Main Still Picture profile bitstream');
        } else if (profile_idc === HevcParser.constants.FF_PROFILE_HEVC_REXT) {
            Log.v(this.TAG, 'Range Extension profile bitstream');
        } else {
            Log.v(this.TAG, 'Unknown HEVC profile: ${profile_idc}');
        }
        // ERROR of profile_idc
        for (i = 0; i < 32; i++) {
            ptl.profile_compatibility_flag[i] = gb.readBits(1);
    
            if (ptl.profile_idc === 0 && i > 0 && ptl.profile_compatibility_flag[i]) {
                ptl.profile_idc = i;
            }
        }
        //
        ptl.progressive_source_flag    = gb.readBits(1);
        ptl.interlaced_source_flag     = gb.readBits(1);
        ptl.non_packed_constraint_flag = gb.readBits(1);
        ptl.frame_only_constraint_flag = gb.readBits(1);
        // 
        switch (profile_idc) {
            case 0x04:
            case 0x05:
            case 0x06:
            case 7:
            case 8:
            case 9:
            case 10: {
                if (!ptl.profile_compatibility_flag[profile_idc]) {
                    break;
                }
                ptl.max_12bit_constraint_flag        = gb.readBits(1);
                ptl.max_10bit_constraint_flag        = gb.readBits(1);
                ptl.max_8bit_constraint_flag         = gb.readBits(1);
                ptl.max_422chroma_constraint_flag    = gb.readBits(1);
                ptl.max_420chroma_constraint_flag    = gb.readBits(1);
                ptl.max_monochrome_constraint_flag   = gb.readBits(1);
                ptl.intra_constraint_flag            = gb.readBits(1);
                ptl.one_picture_only_constraint_flag = gb.readBits(1);
                ptl.lower_bit_rate_constraint_flag   = gb.readBits(1);
                //
                if (profile_idc === 5 || profile_idc === 9 || profile_idc === 10) {
                    ptl.max_14bit_constraint_flag = gb.readBits(1);
                    gb.readBits(32); // XXX_reserved_zero_33bits[0..32]
                    gb.readBits(1);
                } else {
                    gb.readBits(32); // XXX_reserved_zero_34bits[0..33]
                    gb.readBits(2); // XXX_reserved_zero_34bits[0..33]
                }
                break;
            }
            case 2: {
                if (!ptl.profile_compatibility_flag[ptl.profile_idc]) {
                    break;
                }
                //
                gb.readBits(7);
                ptl.one_picture_only_constraint_flag = gb.readBits(1);
                gb.readBits(3); // XXX_reserved_zero_35bits[0..34]
                gb.readBits(32); // XXX_reserved_zero_35bits[0..34]
                break;
            }
            default: {
                gb.readBits(32); // XXX_reserved_zero_43bits[0..42]
                gb.readBits(11); // XXX_reserved_zero_43bits[0..42]
            }
        }
        //
        if (ptl.profile_idc === 1 || ptl.profile_idc === 2 || ptl.profile_idc === 3 ||
            ptl.profile_idc === 4 || ptl.profile_idc === 5 || ptl.profile_idc === 9) {
            //
            if (ptl.profile_compatibility_flag[profile_idc]) {
                ptl.inbld_flag = gb.readBits(1);
            } else {
                gb.readBits(1); // // skip 1bit
            }
        } else {
            gb.readBits(1); // skip 1bit
        }

        return 0;
    }
    static hvcc_parse_ptl(gb, general_ptl, max_sub_layers_minus1) {
        //
        Log.i(this.TAG, `[in] PTL hvcc_parse_ptl ${max_sub_layers_minus1}.`);

        general_ptl.profile_space               = gb.readBits(2); // get_bits(gb, 2);
        Log.i(this.TAG, `PTL profile_space ${general_ptl.profile_space}.`);

        general_ptl.tier_flag                   = gb.readBits(1); //  get_bits1(gb);
        general_ptl.profile_idc                 = gb.readBits(5); // get_bits(gb, 5);
        general_ptl.profile_compatibility_flags = gb.readBits(32);//  get_bits_long(gb, 32);
        general_ptl.constraint_indicator_flags  = gb.readBits(16) << 32 | gb.readBits(32); // get_bits64(gb, 48);
        general_ptl.level_idc                   = gb.readBits(8); // get_bits(gb, 8);
        //
        Log.i(this.TAG, `PTL tier_flag ${general_ptl.tier_flag}.`);
        Log.i(this.TAG, `PTL profile_idc ${general_ptl.profile_idc}.`);
        Log.i(this.TAG, `PTL profile_compatibility_flags ${general_ptl.profile_compatibility_flags}.`);
        Log.i(this.TAG, `PTL constraint_indicator_flags ${general_ptl.constraint_indicator_flags}.`);
        Log.i(this.TAG, `PTL level_idc ${general_ptl.level_idc}.`);

        let sub_layer_profile_present_flag = new Array();
        let sub_layer_level_present_flag = new Array();
        //
        let i = 0;

        for (i = 0; i < max_sub_layers_minus1; i++) {
            sub_layer_profile_present_flag[i] = gb.readBits(1);// get_bits1(gb)
            sub_layer_level_present_flag[i]   = gb.readBits(1);// get_bits1(gb);
            Log.i(this.TAG, `PTL max_sub_layers_minus1 ${i} ${sub_layer_profile_present_flag[i]} ${sub_layer_level_present_flag[i]}.`);

        }
        //
        if (max_sub_layers_minus1 > 0) {
            for (i = max_sub_layers_minus1; i < 8; i++) {
                Log.i(this.TAG, `PTL gb.skipBits(2) ${i}.`);
                gb.readBits(2); // skip_bits(gb, 2); // reserved_zero_2bits[i]

            }
        }
        //
        for (i = 0; i < max_sub_layers_minus1; i++) {
            Log.i(this.TAG, `PTL max_sub_layers_minus1 ${i}.`);

            if (sub_layer_profile_present_flag[i] === 1) {
                /*
                 * sub_layer_profile_space[i]                     u(2)
                 * sub_layer_tier_flag[i]                         u(1)
                 * sub_layer_profile_idc[i]                       u(5)
                 * sub_layer_profile_compatibility_flag[i][0..31] u(32)
                 * sub_layer_progressive_source_flag[i]           u(1)
                 * sub_layer_interlaced_source_flag[i]            u(1)
                 * sub_layer_non_packed_constraint_flag[i]        u(1)
                 * sub_layer_frame_only_constraint_flag[i]        u(1)
                 * sub_layer_reserved_zero_44bits[i]              u(44)
                 */
                gb.skipBits(32);// skip_bits_long(gb, 32);
                gb.skipBits(32);// skip_bits_long(gb, 32);
                gb.skipBits(24);// skip_bits     (gb, 24);
            }
    
            if (sub_layer_level_present_flag[i] === 1) {
                gb.skipBits(8); // skip_bits(gb, 8);
            }
        }
        Log.i(this.TAG, `[out] PTL hvcc_parse_ptl ${max_sub_layers_minus1}.`);
    }
    static parse_ptl(gb, ptl, max_num_sub_layers) {
        let i;
        Log.i(this.TAG, `PTL parse_ptl ${max_num_sub_layers} ${gb.getBitsLeft()}.`);

        if (HevcParser.decode_profile_tier_level(gb) < 0 ||
            gb.getBitsLeft() < 8 + (8 * 2 * (max_num_sub_layers - 1 > 0))) {
            Log.e(this.TAG,  'PTL information too short');
            return -1;
        }

        // ptl.general_ptl.level_idc = gb.readBits(8);
        let level_idc = gb.readBits(8);
        //
        Log.i(this.TAG, `PTL level_idc:${level_idc}.`);
        ptl.sub_layer_profile_present_flag = new Array();
        ptl.sub_layer_level_present_flag = new Array();
        ptl.sub_layer_ptl = new Array();

        
        Log.i(this.TAG, `PTL max_num_sub_layers:${max_num_sub_layers}.`);
        for (i = 0; i < max_num_sub_layers - 1; i++) {
            // gb.readBits(1);
            ptl.sub_layer_profile_present_flag[i] = gb.readBits(1);
            ptl.sub_layer_level_present_flag[i]   = gb.readBits(1);
            // gb.readBits(1);
        }
        //
        if (max_num_sub_layers - 1 > 0) {
            for (i = max_num_sub_layers - 1; i < 8; i++) {
                // skip_bits(gb, 2); // reserved_zero_2bits[i]
                gb.readBits(2); // reserved_zero_2bits[i]
            }
        }
        //
        for (i = 0; i < max_num_sub_layers - 1; i++) {
            if (ptl.sub_layer_profile_present_flag[i] === 1 &&
                HevcParser.decode_profile_tier_level(gb, ptl.sub_layer_ptl[i]) < 0) {
                //
                Log.e(this.TAG, 'PTL information for sublayer ${i} too short.');
                return -1;
            }
            if (ptl.sub_layer_level_present_flag[i] === 1) {
                if (gb.getBitsLeft() < 8) {
                    Log.e(this.TAG, 'Not enough data for sublayer ${i} level_idc');
                    return -1;
                } else {
                    ptl.sub_layer_ptl[i].level_idc = gb.readBits(8);
                }
            }
        }

        Log.i(this.TAG, `[OUT] PTL parse_ptl ${max_num_sub_layers} ${gb.getBitsLeft()}.`);
        return 0;
    }

    static decode_sublayer_hrd(gb, nb_cpb, subpic_params_present) {
        let i;

        for (i = 0; i < nb_cpb; i++) {
            gb.readUEG(); // get_ue_golomb_long(gb); // bit_rate_value_minus1
            gb.readUEG(); // get_ue_golomb_long(gb); // cpb_size_value_minus1

            if (subpic_params_present) {
                gb.readUEG(); // get_ue_golomb_long(gb); // cpb_size_du_value_minus1
                gb.readUEG(); // get_ue_golomb_long(gb); // bit_rate_du_value_minus1
            }
            gb.skipBits(1); // skip_bits1(gb); // cbr_flag
        }
    }

    static decode_hrd(gb, common_inf_present, vps_max_sub_layers) {
        //
        let nal_params_present = 0, vcl_params_present = 0;
        let subpic_params_present = 0;
        let i;

        if (common_inf_present) {
            nal_params_present = gb.readBits(1); //get_bits1(gb);
            vcl_params_present = gb.readBits(1); // get_bits1(gb);

            if (nal_params_present || vcl_params_present) {
                subpic_params_present = gb.readBits(1); //  get_bits1(gb);

                if (subpic_params_present) {
                    gb.skipBits(8); // tick_divisor_minus2
                    gb.skipBits(5); // du_cpb_removal_delay_increment_length_minus1
                    gb.skipBits(1); // sub_pic_cpb_params_in_pic_timing_sei_flag
                    gb.skipBits(5); // dpb_output_delay_du_length_minus1
                }

                gb.skipBits(4); // bit_rate_scale
                gb.skipBits(4); // cpb_size_scale

                if (subpic_params_present) {
                    gb.skipBits(4);  // cpb_size_du_scale
                }

                gb.skipBits(5); // initial_cpb_removal_delay_length_minus1
                gb.skipBits(5); // au_cpb_removal_delay_length_minus1
                gb.skipBits(5); // dpb_output_delay_length_minus1
            }
        }

        for (i = 0; i < vps_max_sub_layers; i++) {
            let low_delay = 0;
            let nb_cpb = 1;
            let fixed_rate = gb.readBits(1); //get_bits1(gb);

            if (!fixed_rate) {
                fixed_rate = gb.readBits(1); // get_bits1(gb);
            }

            if (fixed_rate) {
                gb.readUEG(); // get_ue_golomb_long(gb);  // elemental_duration_in_tc_minus1
            } else {
                low_delay = gb.readBits(1); //get_bits1(gb);
            }

            if (!low_delay) {
                nb_cpb = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
                if (nb_cpb < 1 || nb_cpb > 32) {
                    Log.e(this.TAG, 'nb_cpb ${nb_cpb} invalid\n');
                    return -1;// -1;
                }
            }

            if (nal_params_present) {
                HevcParser.decode_sublayer_hrd(gb, nb_cpb, subpic_params_present);
            }

            if (vcl_params_present) {
                HevcParser.decode_sublayer_hrd(gb, nb_cpb, subpic_params_present);
            }
        }
        return 0;
    }

    static parseVPS(uint8array) {
        Log.i(this.TAG, ' parseVPS ');
        let rbsp = HevcParser._ebsp2rbsp(uint8array);
        let gb = new ExpGolomb(rbsp);
        let i;
        let j;
        let vps = new HevcVps();

        let vps_id =  gb.readBits(4);                       // u(4)
        vps.vps_video_parameter_set_id = vps_id;
        vps.vps_base_layer_internal_flag = gb.readBits(1);  // u(1)
        vps.vps_base_layer_available_flag = gb.readBits(1); // u(1)
        //
        Log.i(this.TAG, `vps_id: ${vps_id} `);
        Log.i(this.TAG, `vps_base_layer_internal_flag : ${vps.vps_base_layer_internal_flag} `);
        Log.i(this.TAG, `vps_base_layer_available_flag: ${vps.vps_base_layer_available_flag} `);

        vps.vps_max_layers = gb.readBits(6) + 1;     // u(6)
        vps.vps_max_sub_layers = gb.readBits(3) + 1; // u(3)
        vps.vps_temporal_id_nesting_flag = gb.readBits(1);  // u(1)

        let vps_reserved_0xffff_16bits = gb.readBits(16);   // u(16)
        if (vps_reserved_0xffff_16bits !== 0xffff) {
            // error: 'vps_reserved_ffff_16bits is not 0xffff\n'
        }
        // 
        if (vps.vps_max_sub_layers > HevcParser.constants.HEVC_MAX_SUB_LAYERS) {
            // error: vps_max_sub_layers out of range
        }

        Log.i(this.TAG, `vps_max_layers: ${vps.vps_max_layers} `);
        Log.i(this.TAG, `vps_max_sub_layers: ${vps.vps_max_sub_layers} `);
        Log.i(this.TAG, `vps_temporal_id_nesting_flag: ${vps.vps_temporal_id_nesting_flag} `);
        Log.i(this.TAG, `vps_reserved_0xffff_16bits: ${vps_reserved_0xffff_16bits} `);

        //
        HevcParser.hvcc_parse_ptl(gb, vps.ptl, vps.vps_max_sub_layers);
        // parse_ptl
        //
        let vps_sub_layer_ordering_info_present_flag = gb.readBits(1);
        // 
        Log.i(this.TAG, `vps_sub_layer_ordering_info_present_flag: ${vps_sub_layer_ordering_info_present_flag} `);

        i = vps_sub_layer_ordering_info_present_flag === 1 ? 0 : vps.vps_max_sub_layers - 1;
        Log.i(this.TAG, `vps_sub_layer_ordering_info_present_flag: ${vps_sub_layer_ordering_info_present_flag} ${i} `);
        
        vps.vps_max_dec_pic_buffering = new Array();
        vps.vps_num_reorder_pics = new Array();
        vps.vps_max_latency_increase = new Array();

        for (; i < vps.vps_max_sub_layers; i++) {
            Log.i(this.TAG, ` ${i} `);

            vps.vps_max_dec_pic_buffering[i] = gb.readUEG() + 1;    // get_ue_golomb_long(gb) + 1;
            vps.vps_num_reorder_pics[i]      = gb.readUEG();        // get_ue_golomb_long(gb);
            vps.vps_max_latency_increase[i]  = gb.readUEG() - 1;    // get_ue_golomb_long(gb) - 1;
    
            if (vps.vps_max_dec_pic_buffering[i] > HevcParser.constants.HEVC_MAX_DPB_SIZE || !vps.vps_max_dec_pic_buffering[i]) {
                Log.e(this.TAG, `vps_max_dec_pic_buffering_minus1 out of range: ${vps.vps_max_dec_pic_buffering[i] - 1}`);
                // goto err;
            }
            if (vps.vps_num_reorder_pics[i] > vps.vps_max_dec_pic_buffering[i] - 1) {
                Log.e(this.TAG, `vps_max_num_reorder_pics out of range: ${vps.vps_num_reorder_pics[i]}`);
                // if (avctx->err_recognition & AV_EF_EXPLODE)
                //     goto err;
            }
        }
    
        vps.vps_max_layer_id   = gb.readBits(6);
        vps.vps_num_layer_sets = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
        //
        Log.i(this.TAG, `vps_max_layer_id: ${vps.vps_max_layer_id} `);
        Log.i(this.TAG, `vps_num_layer_sets: ${vps.vps_num_layer_sets} `);

        if (vps.vps_num_layer_sets < 1 || vps.vps_num_layer_sets > 1024 ||
            (vps.vps_num_layer_sets - 1) * (vps.vps_max_layer_id + 1) > gb.getBitsLeft()) { 
                // get_bits_left(gb)
            Log.e(this.TAG, 'too many layer_id_included_flags');
            // goto err;
        }
    
        for (i = 1; i < vps.vps_num_layer_sets; i++) {
            for (j = 0; j <= vps.vps_max_layer_id; j++) {
                // skip_bits(gb, 1);  // layer_id_included_flag[i][j]
                gb.readBits(1);
            }
        }
    
        vps.vps_timing_info_present_flag = gb.readBits(1); // get_bits1(gb);
        Log.i(this.TAG, `vps_num_layer_sets: ${vps.vps_timing_info_present_flag} `);

        if (vps.vps_timing_info_present_flag === 1) {
            vps.vps_num_units_in_tick               = gb.readBits(32); // get_bits_long(gb, 32);
            vps.vps_time_scale                      = gb.readBits(32); // get_bits_long(gb, 32);
            vps.vps_poc_proportional_to_timing_flag = gb.readBits(1); // get_bits1(gb);
            if (vps.vps_poc_proportional_to_timing_flag) {
                vps.vps_num_ticks_poc_diff_one = gb.readUEG() + 1; // get_ue_golomb_long(gb) + 1;
            }
            vps.vps_num_hrd_parameters = gb.readUEG();// get_ue_golomb_long(gb);
            if (vps.vps_num_hrd_parameters > vps.vps_num_layer_sets) {
                Log.e(this.TAG, `vps_num_hrd_parameters ${vps.vps_num_hrd_parameters} is invalid.`);
                // goto err;
            }
            Log.i(this.TAG, `vps_num_units_in_tick: ${vps.vps_num_units_in_tick} `);
            Log.i(this.TAG, `vps_time_scale: ${vps.vps_time_scale} `);
            Log.i(this.TAG, `vps_poc_proportional_to_timing_flag: ${vps.vps_poc_proportional_to_timing_flag} `);
            Log.i(this.TAG, `vps_num_hrd_parameters: ${vps.vps_num_hrd_parameters} `);

            for (i = 0; i < vps.vps_num_hrd_parameters; i++) {
                let common_inf_present = 1;
    
                gb.readUEG(); // get_ue_golomb_long(gb); // hrd_layer_set_idx
                if (i) {
                    common_inf_present = gb.readBits(1); // get_bits1(gb);
                }
                HevcParser.decode_hrd(gb, common_inf_present, vps.vps_max_sub_layers);
            }
        }
        gb.readBits(1); // get_bits1(gb); /* vps_extension_flag */
    
        if (gb.getBitsLeft() < 0) {
            Log.e(this.TAG, 'Overread VPS by ${- gb.getBitsLeft()} bits.');
            // if (ps.vps_list[vps_id]) {
            //     // goto err;
            // }
        }
        /*
        if (ps.vps_list[vps_id] &&
            !memcmp(ps->vps_list[vps_id]->data, vps_buf->data, vps_buf->size)) {
            av_buffer_unref(&vps_buf);
        } else {
            remove_vps(ps, vps_id);
            ps->vps_list[vps_id] = vps_buf;
        }
        */
        Log.i(this.TAG, '[out]');
        return 0;
    }

    static parsePPS(uint8array, pps) {

    }


    static _skipScalingList(gb, count) {
        let last_scale = 8, next_scale = 8;
        let delta_scale = 0;
        for (let i = 0; i < count; i++) {
            if (next_scale !== 0) {
                delta_scale = gb.readSEG();
                next_scale = (last_scale + delta_scale + 256) % 256;
            }
            last_scale = (next_scale === 0) ? last_scale : next_scale;
        }
    }

    static getProfileString(profile_idc) {
        switch (profile_idc) {
            case 66:
                return 'Baseline';
            case 77:
                return 'Main';
            case 88:
                return 'Extended';
            case 100:
                return 'High';
            case 110:
                return 'High10';
            case 122:
                return 'High422';
            case 244:
                return 'High444';
            default:
                return 'Unknown';
        }
    }

    static getLevelString(level_idc) {
        return (level_idc / 10).toFixed(1);
    }

    static getChromaFormatString(chroma) {
        switch (chroma) {
            case 420:
                return '4:2:0';
            case 422:
                return '4:2:2';
            case 444:
                return '4:4:4';
            default:
                return 'Unknown';
        }
    }

    static isKeyFrame(nal_type) {
        switch (nal_type) {
            case HevcParser.constants.HEVC_NAL_UNIT_CODED_SLICE_BLA_W_LP:
            case HevcParser.constants.HEVC_NAL_UNIT_CODED_SLICE_BLA_W_RADL:
            case HevcParser.constants.HEVC_NAL_UNIT_CODED_SLICE_BLA_N_LP:
            case HevcParser.constants.HEVC_NAL_UNIT_CODED_SLICE_IDR_W_RADL:
            case HevcParser.constants.HEVC_NAL_UNIT_CODED_SLICE_IDR_N_LP:
            case HevcParser.constants.HEVC_NAL_UNIT_CODED_SLICE_CRA:
                return true;
        }

        return false;
    }
}

HevcParser.init();

export default HevcParser;
// export default HevcVps;
// export default HevcSps;